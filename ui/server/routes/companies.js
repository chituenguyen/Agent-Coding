import { Router } from "express";
import { readFile, stat, mkdir, rm } from "fs/promises";
import { existsSync } from "fs";
import path from "path";

import { WORKSPACE, UI_DIR } from "../lib/paths.js";
import {
  slugifyCompanyId,
  readCompaniesFile,
  writeCompaniesFile,
  defaultEngineerRoom,
  saveCompanyLogo,
} from "../lib/companies.js";
import { validateAgentDef, runRoomDesigner } from "../lib/room-designer.js";

const router = Router();

// Companies / rooms / teams — describes the multi-tenant org structure shown
// on the homepage. Backed by companies.json at workspace root. Each team
// declares its own repo allowlist so subagent runs can be constrained.
router.get("/api/companies", async (req, res) => {
  try {
    const raw = await readFile(path.join(WORKSPACE, "companies.json"), "utf8");
    const data = JSON.parse(raw);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/api/companies/:companyId", async (req, res) => {
  try {
    const raw = await readFile(path.join(WORKSPACE, "companies.json"), "utf8");
    const data = JSON.parse(raw);
    const company = (data.companies || []).find(
      (c) => c.id === req.params.companyId,
    );
    if (!company) return res.status(404).json({ error: "Company not found" });
    res.json(company);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/api/companies", async (req, res) => {
  try {
    const {
      name,
      tagline = "",
      accent = "#6b7280",
      logo = null,
      repoPath = "",
      init = false,
      id: rawId,
    } = req.body || {};
    if (!name?.trim())
      return res.status(400).json({ error: "name is required" });
    const data = await readCompaniesFile();
    const list = data.companies || (data.companies = []);

    const id =
      (rawId ? slugifyCompanyId(rawId) : slugifyCompanyId(name)) || null;
    if (!id)
      return res.status(400).json({ error: "could not derive id from name" });
    if (list.some((c) => c.id === id))
      return res.status(409).json({ error: `company '${id}' already exists` });

    const trimmedPath = String(repoPath || "").trim();
    if (trimmedPath) {
      if (!path.isAbsolute(trimmedPath))
        return res.status(400).json({ error: "repoPath must be absolute" });
      if (!existsSync(trimmedPath)) {
        if (init) {
          await mkdir(trimmedPath, { recursive: true });
        } else {
          return res.status(400).json({
            error: "repoPath does not exist (pass init=true to create it)",
          });
        }
      } else {
        const st = await stat(trimmedPath);
        if (!st.isDirectory())
          return res.status(400).json({ error: "repoPath is not a directory" });
      }
    }

    let logoUrl = null;
    try {
      logoUrl = await saveCompanyLogo(id, logo);
    } catch (e) {
      return res.status(400).json({ error: e.message });
    }

    const company = {
      id,
      name: name.trim(),
      tagline: tagline.trim(),
      accent,
      ...(logoUrl ? { logo: logoUrl } : {}),
      rooms: [defaultEngineerRoom(trimmedPath)],
    };
    list.push(company);
    await writeCompaniesFile(data);
    res.status(201).json(company);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch("/api/companies/:companyId", async (req, res) => {
  try {
    const { companyId } = req.params;
    const { name, tagline, accent, logo } = req.body || {};
    const data = await readCompaniesFile();
    const company = (data.companies || []).find((c) => c.id === companyId);
    if (!company) return res.status(404).json({ error: "company not found" });

    if (typeof name === "string" && name.trim()) company.name = name.trim();
    if (typeof tagline === "string") company.tagline = tagline.trim();
    if (typeof accent === "string" && accent.trim())
      company.accent = accent.trim();
    if (logo !== undefined) {
      if (logo === null || logo === "") {
        delete company.logo;
      } else {
        try {
          const url = await saveCompanyLogo(companyId, logo);
          if (url) company.logo = url;
        } catch (e) {
          return res.status(400).json({ error: e.message });
        }
      }
    }

    await writeCompaniesFile(data);
    res.json(company);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch("/api/companies/:companyId/teams/:teamId", async (req, res) => {
  try {
    const { companyId, teamId } = req.params;
    const { repos, name, tagline, agent, color, icon } = req.body || {};
    const data = await readCompaniesFile();
    const company = (data.companies || []).find((c) => c.id === companyId);
    if (!company) return res.status(404).json({ error: "company not found" });
    let team = null;
    let room = null;
    for (const r of company.rooms || []) {
      for (const t of r.teams || []) {
        if (t.id === teamId) {
          team = t;
          room = r;
        }
      }
    }
    if (!team) return res.status(404).json({ error: "team not found" });

    if (Array.isArray(repos)) {
      const seen = new Set();
      const cleaned = [];
      for (const raw of repos) {
        const p = String(raw || "").trim();
        if (!p) continue;
        if (!path.isAbsolute(p))
          return res
            .status(400)
            .json({ error: `repo path must be absolute: ${p}` });
        if (seen.has(p)) continue;
        seen.add(p);
        if (!existsSync(p))
          return res.status(400).json({ error: `path does not exist: ${p}` });
        const st = await stat(p);
        if (!st.isDirectory())
          return res.status(400).json({ error: `not a directory: ${p}` });
        cleaned.push(p);
      }
      team.repos = cleaned;
    }
    if (typeof name === "string" && name.trim()) team.name = name.trim();
    if (typeof tagline === "string") team.tagline = tagline.trim();
    if (typeof agent === "string" && agent.trim()) team.agent = agent.trim();
    if (typeof color === "string" && color.trim()) team.color = color.trim();
    if (typeof icon === "string") team.icon = icon;

    await writeCompaniesFile(data);
    res.json({ company, room, team });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post(
  "/api/companies/:companyId/rooms/:roomId/teams",
  async (req, res) => {
    try {
      const { companyId, roomId } = req.params;
      const {
        id: rawId,
        name,
        tagline = "",
        agent,
        color = "#6b7280",
        icon = "",
        repos = [],
      } = req.body || {};

      if (!name?.trim())
        return res.status(400).json({ error: "name is required" });
      if (!agent?.trim())
        return res.status(400).json({ error: "agent is required" });

      const id = slugifyCompanyId(rawId || name);
      if (!id)
        return res.status(400).json({ error: "could not derive id from name" });

      const data = await readCompaniesFile();
      const company = (data.companies || []).find((c) => c.id === companyId);
      if (!company) return res.status(404).json({ error: "company not found" });

      const room = (company.rooms || []).find((r) => r.id === roomId);
      if (!room) return res.status(404).json({ error: "room not found" });
      if (room.kind !== "engineer")
        return res
          .status(400)
          .json({ error: "teams can only be added to engineer rooms" });

      room.teams = room.teams || [];
      if (room.teams.some((t) => t.id === id))
        return res
          .status(409)
          .json({ error: `team '${id}' already exists in this room` });

      const cleanedRepos = [];
      const seen = new Set();
      for (const raw of Array.isArray(repos) ? repos : []) {
        const p = String(raw || "").trim();
        if (!p) continue;
        if (!path.isAbsolute(p))
          return res
            .status(400)
            .json({ error: `repo path must be absolute: ${p}` });
        if (seen.has(p)) continue;
        seen.add(p);
        if (!existsSync(p))
          return res.status(400).json({ error: `path does not exist: ${p}` });
        const st = await stat(p);
        if (!st.isDirectory())
          return res.status(400).json({ error: `not a directory: ${p}` });
        cleanedRepos.push(p);
      }

      const team = {
        id,
        name: name.trim(),
        tagline: String(tagline || "").trim(),
        agent: agent.trim(),
        color: String(color || "#6b7280").trim(),
        icon: String(icon || ""),
        repos: cleanedRepos,
      };
      room.teams.push(team);

      await writeCompaniesFile(data);
      res.status(201).json({ company, room, team });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },
);

router.delete(
  "/api/companies/:companyId/rooms/:roomId/teams/:teamId",
  async (req, res) => {
    try {
      const { companyId, roomId, teamId } = req.params;
      const data = await readCompaniesFile();
      const company = (data.companies || []).find((c) => c.id === companyId);
      if (!company) return res.status(404).json({ error: "company not found" });
      const room = (company.rooms || []).find((r) => r.id === roomId);
      if (!room) return res.status(404).json({ error: "room not found" });
      const before = (room.teams || []).length;
      room.teams = (room.teams || []).filter((t) => t.id !== teamId);
      if (room.teams.length === before)
        return res.status(404).json({ error: "team not found" });
      await writeCompaniesFile(data);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },
);

router.post("/api/companies/:companyId/rooms", async (req, res) => {
  try {
    const { companyId } = req.params;
    const {
      id: rawId,
      name,
      description = "",
      kind = "engineer",
      route,
    } = req.body || {};

    if (!name?.trim())
      return res.status(400).json({ error: "name is required" });
    if (!["engineer", "trading"].includes(kind))
      return res
        .status(400)
        .json({ error: "kind must be 'engineer' or 'trading'" });

    const id = slugifyCompanyId(rawId || name);
    if (!id)
      return res.status(400).json({ error: "could not derive id from name" });

    const data = await readCompaniesFile();
    const company = (data.companies || []).find((c) => c.id === companyId);
    if (!company) return res.status(404).json({ error: "company not found" });

    company.rooms = company.rooms || [];
    if (company.rooms.some((r) => r.id === id))
      return res
        .status(409)
        .json({ error: `room '${id}' already exists in this company` });

    let room;
    if (kind === "trading") {
      room = {
        id,
        name: name.trim(),
        description: String(description || "").trim(),
        kind: "trading",
        route: String(route || "/trading").trim() || "/trading",
      };
    } else {
      room = {
        id,
        name: name.trim(),
        description:
          String(description || "").trim() ||
          "Cross-functional engineering — FE, BE, DevOps, Solution Architect",
        kind: "engineer",
        teams: [],
      };
    }

    company.rooms.push(room);
    await writeCompaniesFile(data);
    res.status(201).json({ company, room });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/api/companies/:companyId/rooms/:roomId", async (req, res) => {
  try {
    const { companyId, roomId } = req.params;
    const data = await readCompaniesFile();
    const company = (data.companies || []).find((c) => c.id === companyId);
    if (!company) return res.status(404).json({ error: "company not found" });
    const before = (company.rooms || []).length;
    company.rooms = (company.rooms || []).filter((r) => r.id !== roomId);
    if (company.rooms.length === before)
      return res.status(404).json({ error: "room not found" });
    await writeCompaniesFile(data);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/api/companies/:companyId", async (req, res) => {
  try {
    const { companyId } = req.params;
    const data = await readCompaniesFile();
    const before = (data.companies || []).length;
    data.companies = (data.companies || []).filter((c) => c.id !== companyId);
    if (data.companies.length === before)
      return res.status(404).json({ error: "company not found" });
    await writeCompaniesFile(data);
    // Best-effort cleanup of the uploaded logo dir (doesn't touch the user's repo)
    try {
      await rm(path.join(UI_DIR, "public", "logos", companyId), {
        recursive: true,
        force: true,
      });
    } catch {
      // ignore
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── room designer (AI-assisted room creation) ──────────────────────────────

// Start: generate a draft room from a free-form description.
// Streams NDJSON: { chunk: "..." } progress events, then { done: true, result }.
router.post(
  "/api/companies/:companyId/rooms/design/start",
  async (req, res) => {
    const { companyId } = req.params;
    const { description } = req.body || {};
    if (!description?.trim())
      return res.status(400).json({ error: "description required" });

    let companyContext = "";
    try {
      const data = await readCompaniesFile();
      const company = (data.companies || []).find((c) => c.id === companyId);
      if (company) {
        const roomNames = (company.rooms || []).map((r) => r.name).join(", ");
        companyContext = `Company: ${company.name}. Existing rooms: ${roomNames || "none"}.`;
      }
    } catch {
      // best-effort context — generation still works without it
    }

    res.setHeader("Content-Type", "application/x-ndjson");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("X-Accel-Buffering", "no");
    const send = (obj) => res.write(JSON.stringify(obj) + "\n");

    try {
      const result = await runRoomDesigner(
        { mode: "start", description: description.trim(), companyContext },
        { stream: true, res },
      );
      send({ done: true, result });
      res.end();
    } catch (err) {
      send({ error: err.message });
      res.end();
    }
  },
);

router.post(
  "/api/companies/:companyId/rooms/design/regen-agent",
  async (req, res) => {
    try {
      const { currentRoom, teamId, instructions = "" } = req.body || {};
      if (!currentRoom || !teamId)
        return res
          .status(400)
          .json({ error: "currentRoom and teamId required" });
      const result = await runRoomDesigner({
        mode: "regen-agent",
        currentRoom,
        teamId,
        instructions,
      });
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },
);

router.post(
  "/api/companies/:companyId/rooms/design/check-stale",
  async (req, res) => {
    try {
      const { currentRoom, editedTeamId, previousAgentDef } = req.body || {};
      if (!currentRoom || !editedTeamId)
        return res
          .status(400)
          .json({ error: "currentRoom and editedTeamId required" });
      const result = await runRoomDesigner({
        mode: "check-stale",
        currentRoom,
        editedTeamId,
        previousAgentDef,
      });
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },
);

router.post(
  "/api/companies/:companyId/rooms/design/finalize",
  async (req, res) => {
    try {
      const { companyId } = req.params;
      const { id: rawId, name, description = "", teams = [] } = req.body || {};
      if (!name?.trim())
        return res.status(400).json({ error: "name is required" });
      if (!Array.isArray(teams) || teams.length === 0)
        return res.status(400).json({ error: "at least one team is required" });

      const roomId = slugifyCompanyId(rawId || name);
      if (!roomId)
        return res.status(400).json({ error: "could not derive id from name" });

      const cleanedTeams = [];
      const seenTeamIds = new Set();
      for (const t of teams) {
        if (!t?.name?.trim())
          return res.status(400).json({ error: "team name required" });
        const tid = slugifyCompanyId(t.id || t.name);
        if (!tid)
          return res
            .status(400)
            .json({ error: `could not derive id for team ${t.name}` });
        if (seenTeamIds.has(tid))
          return res.status(400).json({ error: `duplicate team id: ${tid}` });
        seenTeamIds.add(tid);

        const hasSlug = typeof t.agent === "string" && t.agent.trim();
        const hasDef = t.agentDef && typeof t.agentDef === "object";
        if (!hasSlug && !hasDef)
          return res
            .status(400)
            .json({ error: `team ${t.name}: needs agent slug or agentDef` });

        const team = {
          id: tid,
          name: t.name.trim(),
          tagline: String(t.tagline || "").trim(),
          color: String(t.color || "#6b7280").trim(),
          icon: String(t.icon || ""),
          repos: Array.isArray(t.repos) ? t.repos.filter(Boolean) : [],
        };
        if (hasSlug) team.agent = t.agent.trim();
        if (hasDef) {
          const err = validateAgentDef(t.agentDef, `team ${t.name}`);
          if (err) return res.status(400).json({ error: err });
          team.agentDef = {
            model: t.agentDef.model || "sonnet",
            tools: Array.isArray(t.agentDef.tools) ? t.agentDef.tools : [],
            description: String(t.agentDef.description || "").trim(),
            systemPrompt: String(t.agentDef.systemPrompt).trim(),
          };
          if (t.agentDef.tools_acknowledged)
            team.agentDef.tools_acknowledged = true;
        }
        cleanedTeams.push(team);
      }

      const data = await readCompaniesFile();
      const company = (data.companies || []).find((c) => c.id === companyId);
      if (!company) return res.status(404).json({ error: "company not found" });
      company.rooms = company.rooms || [];
      if (company.rooms.some((r) => r.id === roomId))
        return res
          .status(409)
          .json({ error: `room '${roomId}' already exists` });

      const room = {
        id: roomId,
        name: name.trim(),
        description: String(description || "").trim(),
        kind: "engineer",
        layout: "teams",
        teams: cleanedTeams,
      };
      company.rooms.push(room);
      await writeCompaniesFile(data);
      res.status(201).json({ company, room });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },
);

export default router;
