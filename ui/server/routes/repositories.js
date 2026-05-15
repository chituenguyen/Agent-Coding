import { Router } from "express";
import { readFile, writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";

import { WORKSPACE } from "../lib/paths.js";
import {
  readMcpServer,
  writeMcpServer,
  readProjectMcpConfig,
  writeProjectMcpConfig,
  getRepos,
} from "../lib/mcp-config.js";
import { buildCompanyPathMap, lookupCompanyForPath } from "../lib/companies.js";
import { readGlobalClaude } from "../lib/claude-json.js";
import {
  scanRepoHealth,
  invalidateHealthCache,
  claudeMdPathFor,
  readClaudeMdFor,
  writeClaudeMdFor,
} from "../lib/repo-health.js";
import {
  checkLinks,
  repairLinks,
  ensureGitignore,
} from "../lib/workspace-links.js";
import { REPO_HEALTH_CACHE, REPO_HEALTH_TTL_MS } from "../state/caches.js";

const router = Router();

router.get("/api/repositories", async (req, res) => {
  try {
    const repos = await getRepos();

    // Dedupe by path, keeping earliest addedAt; warn once per duplicate path.
    const byPath = new Map();
    const warned = new Set();
    for (const r of repos) {
      const key = String(r.path || "").replace(/\/+$/, "");
      if (!key) {
        byPath.set(`__noPath__${r.name}`, r);
        continue;
      }
      const existing = byPath.get(key);
      if (!existing) {
        byPath.set(key, r);
      } else {
        if (!warned.has(key)) {
          console.warn(
            `[api/repositories] duplicate repo path "${key}" — keeping "${existing.name}" (earliest addedAt), dropping "${r.name}"`,
          );
          warned.add(key);
        }
        const existingT = Date.parse(existing.addedAt || "") || Infinity;
        const incomingT = Date.parse(r.addedAt || "") || Infinity;
        if (incomingT < existingT) byPath.set(key, r);
      }
    }
    const deduped = Array.from(byPath.values());

    const companyMap = await buildCompanyPathMap();

    const enriched = await Promise.all(
      deduped.map(async (r) => {
        const mcpConfig = await readProjectMcpConfig(r.name);
        return {
          name: r.name,
          repoPath: r.path || "",
          mcpServerCount: Object.keys(mcpConfig.mcpServers || {}).length,
          company: lookupCompanyForPath(companyMap, r.path),
          virtual: false,
        };
      }),
    );

    // Surface companies.json-declared repos that are NOT yet in mcp_server.json
    // as virtual entries so /mcp shows the complete company hierarchy.
    const covered = new Set(
      enriched.map((r) => String(r.repoPath || "").replace(/\/+$/, "")),
    );
    const slugify = (s) =>
      String(s)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
    const virtual = [];
    const usedNames = new Set(enriched.map((r) => r.name));
    for (const [absPath, company] of companyMap.entries()) {
      const normalized = String(absPath).replace(/\/+$/, "");
      if (covered.has(normalized)) continue;
      let baseName = slugify(path.basename(normalized)) || "repo";
      let name = baseName;
      let i = 2;
      while (usedNames.has(name)) name = `${baseName}-${i++}`;
      usedNames.add(name);
      virtual.push({
        name,
        repoPath: normalized,
        mcpServerCount: 0,
        company,
        virtual: true,
      });
    }

    res.json([...enriched, ...virtual]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/api/repositories", async (req, res) => {
  try {
    const { path: repoPath, name: customName } = req.body;
    if (!repoPath?.trim())
      return res.status(400).json({ error: "path required" });

    const name =
      customName?.trim() ||
      path
        .basename(repoPath.trim())
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");

    const data = await readMcpServer();
    data.repositories = data.repositories || [];
    if (data.repositories.find((r) => r.name === name)) {
      return res
        .status(409)
        .json({ error: `Repository "${name}" already exists` });
    }

    data.repositories.push({
      name,
      path: repoPath.trim(),
      addedAt: new Date().toISOString(),
    });
    await writeMcpServer(data);

    const contextPath = path.join(WORKSPACE, "projects", name, "context.md");
    if (!existsSync(contextPath)) {
      await mkdir(path.dirname(contextPath), { recursive: true });
      await writeFile(
        contextPath,
        `# Project Context: ${name}

**Repo path:** ${repoPath.trim()}

## Tech Stack

<!-- Describe the tech stack, frameworks, languages used -->

## Coding Conventions

<!-- Naming conventions, file structure rules, patterns to follow -->

## Forbidden Patterns

<!-- Things agents must NOT do in this project -->

## Notes

<!-- Any other context agents should know before working on this project -->
`,
      );
    }

    // Auto-add to additionalDirectories
    const userSettingsPath = path.join(
      process.env.HOME,
      ".claude",
      "settings.json",
    );
    try {
      const raw = await readFile(userSettingsPath, "utf8");
      const settings = JSON.parse(raw);
      const dirs = settings.permissions?.additionalDirectories || [];
      if (!dirs.includes(repoPath.trim())) {
        dirs.push(repoPath.trim());
        if (!settings.permissions) settings.permissions = {};
        settings.permissions.additionalDirectories = dirs;
        await writeFile(
          userSettingsPath,
          JSON.stringify(settings, null, 2) + "\n",
        );
      }
    } catch {
      /* ignore */
    }

    res.json({ name, path: repoPath.trim() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/api/repositories/:name", async (req, res) => {
  try {
    const data = await readMcpServer();
    const before = (data.repositories || []).length;
    data.repositories = (data.repositories || []).filter(
      (r) => r.name !== req.params.name,
    );
    if (data.repositories.length === before)
      return res.status(404).json({ error: "Not found" });
    await writeMcpServer(data);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/api/repositories/:project/mcp", async (req, res) => {
  try {
    res.json(await readProjectMcpConfig(req.params.project));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put("/api/repositories/:project/mcp/:serverName", async (req, res) => {
  try {
    const { project, serverName } = req.params;
    const config = await readProjectMcpConfig(project);
    config.mcpServers[serverName] = req.body;
    await writeProjectMcpConfig(project, config.mcpServers);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete(
  "/api/repositories/:project/mcp/:serverName",
  async (req, res) => {
    try {
      const { project, serverName } = req.params;
      const config = await readProjectMcpConfig(project);
      delete config.mcpServers[serverName];
      await writeProjectMcpConfig(project, config.mcpServers);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },
);

router.get("/api/repositories/:name/health", async (req, res) => {
  try {
    const { name } = req.params;
    const repos = await getRepos();
    const repo = repos.find((r) => r.name === name);
    if (!repo) {
      return res.status(404).json({
        error: `Repository '${name}' not found in companies/mcp_server`,
      });
    }

    const cached = REPO_HEALTH_CACHE.get(name);
    if (cached && Date.now() - cached.at < REPO_HEALTH_TTL_MS) {
      return res.json(cached.payload);
    }

    console.error(`[scan] ${name}`);
    const [companyMap, globalClaude] = await Promise.all([
      buildCompanyPathMap(),
      readGlobalClaude(),
    ]);
    const payload = await scanRepoHealth(repo, companyMap, globalClaude);
    REPO_HEALTH_CACHE.set(name, { at: Date.now(), payload });
    res.json(payload);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/api/repositories/:name/link-status", async (req, res) => {
  try {
    const { name } = req.params;
    const repos = await getRepos();
    const repo = repos.find((r) => r.name === name);
    if (!repo) {
      return res.status(404).json({
        error: `Repository '${name}' not found in companies/mcp_server`,
      });
    }
    const repoPath = repo.path || "";
    if (!repoPath || !existsSync(repoPath)) {
      return res.status(404).json({ error: "repository path missing on disk" });
    }
    const result = await checkLinks(repoPath);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/api/repositories/:name/repair-links", async (req, res) => {
  try {
    const { name } = req.params;
    const repos = await getRepos();
    const repo = repos.find((r) => r.name === name);
    if (!repo) {
      return res.status(404).json({
        error: `Repository '${name}' not found in companies/mcp_server`,
      });
    }
    const repoPath = repo.path || "";
    if (!repoPath || !existsSync(repoPath)) {
      return res.status(404).json({ error: "repository path missing on disk" });
    }
    const includeGitignore =
      req.body && typeof req.body.includeGitignore === "boolean"
        ? req.body.includeGitignore
        : true;
    const result = await repairLinks(repoPath);
    let gitignore = { appended: false, lines: [] };
    if (includeGitignore) {
      gitignore = await ensureGitignore(repoPath);
    }
    invalidateHealthCache(name);
    res.json({ result, gitignore });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/api/repositories/:name/claude-md", async (req, res) => {
  try {
    const { name } = req.params;
    const repos = await getRepos();
    const repo = repos.find((r) => r.name === name);
    if (!repo) {
      return res.status(404).json({
        error: `Repository '${name}' not found in companies/mcp_server`,
      });
    }
    const repoPath = repo.path || "";
    const resolved = claudeMdPathFor(repoPath);
    if (!resolved) {
      return res.status(400).json({ error: "invalid repo path" });
    }
    const result = await readClaudeMdFor(repoPath);
    if (!result) {
      return res
        .status(404)
        .json({ error: "CLAUDE.md not found", path: resolved });
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put("/api/repositories/:name/claude-md", async (req, res) => {
  try {
    const { name } = req.params;
    const body = req.body || {};
    if (typeof body.content !== "string") {
      return res.status(400).json({ error: "content required (string)" });
    }
    if (body.expectedMtime !== null && typeof body.expectedMtime !== "string") {
      return res
        .status(400)
        .json({ error: "expectedMtime must be string or null" });
    }
    const repos = await getRepos();
    const repo = repos.find((r) => r.name === name);
    if (!repo) {
      return res.status(404).json({
        error: `Repository '${name}' not found in companies/mcp_server`,
      });
    }
    const repoPath = repo.path || "";
    if (!repoPath) {
      return res.status(400).json({ error: "repository has no path" });
    }

    try {
      const result = await writeClaudeMdFor(
        repoPath,
        body.content,
        body.expectedMtime,
      );
      invalidateHealthCache(name);
      res.json(result);
    } catch (err) {
      if (err && err.code === "STALE") {
        return res.status(409).json({
          error: "stale",
          currentMtime: err.currentMtime,
          currentContent: err.currentContent,
        });
      }
      if (err && err.code === "EBADPATH") {
        return res.status(400).json({ error: "invalid repo path" });
      }
      throw err;
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
