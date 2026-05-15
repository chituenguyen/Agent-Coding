import { Router } from "express";
import { readFile, writeFile, rm } from "fs/promises";

import {
  GLOBAL_SETTINGS,
  WORKSPACE_NAME_FILE,
  DEFAULT_WORKSPACE_NAME,
} from "../lib/paths.js";
import { readSettings, readWorkspaceName, deepMerge } from "../lib/settings.js";
import { readGlobalClaude, writeGlobalClaude } from "../lib/claude-json.js";
import { readProjectMcp, writeProjectMcp } from "../lib/mcp-config.js";

const router = Router();

router.get("/api/workspace-name", async (req, res) => {
  try {
    res.json(await readWorkspaceName());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put("/api/workspace-name", async (req, res) => {
  try {
    const next = String(req.body?.name || "").trim();
    if (!next) {
      try {
        await rm(WORKSPACE_NAME_FILE);
      } catch {
        /* ignore */
      }
      return res.json({ name: DEFAULT_WORKSPACE_NAME, custom: false });
    }
    if (next.length > 64)
      return res.status(400).json({ error: "Name too long (max 64 chars)" });
    await writeFile(WORKSPACE_NAME_FILE, next);
    res.json({ name: next, custom: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/api/settings", async (req, res) => {
  try {
    res.json(await readSettings());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put("/api/settings", async (req, res) => {
  try {
    const current = await readSettings();
    const merged = deepMerge(current, req.body);
    await writeFile(GLOBAL_SETTINGS, JSON.stringify(merged, null, 2));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET both scopes (global + project)
router.get("/api/mcp", async (req, res) => {
  try {
    const global = await readGlobalClaude();
    const project = await readProjectMcp();

    const connectors = Array.isArray(global.claudeAiMcpEverConnected)
      ? global.claudeAiMcpEverConnected.map((entry) => {
          const rawLabel = String(entry);
          const name = rawLabel.replace(/^claude\.ai\s+/, "");
          return { name, rawLabel, source: "claude.ai" };
        })
      : [];

    const perProjectState = {};
    const projects = global.projects || {};
    for (const [absPath, proj] of Object.entries(projects)) {
      if (!proj || typeof proj !== "object") continue;
      const entry = {};
      if (
        Array.isArray(proj.enabledMcpServers) &&
        proj.enabledMcpServers.length
      )
        entry.enabledMcpServers = proj.enabledMcpServers;
      if (
        Array.isArray(proj.disabledMcpServers) &&
        proj.disabledMcpServers.length
      )
        entry.disabledMcpServers = proj.disabledMcpServers;
      if (
        Array.isArray(proj.enabledMcpjsonServers) &&
        proj.enabledMcpjsonServers.length
      )
        entry.enabledMcpjsonServers = proj.enabledMcpjsonServers;
      if (
        Array.isArray(proj.disabledMcpjsonServers) &&
        proj.disabledMcpjsonServers.length
      )
        entry.disabledMcpjsonServers = proj.disabledMcpjsonServers;
      if (
        proj.mcpServers &&
        typeof proj.mcpServers === "object" &&
        Object.keys(proj.mcpServers).length
      )
        entry.mcpServers = proj.mcpServers;
      if (Object.keys(entry).length) perProjectState[absPath] = entry;
    }

    res.json({
      global: global.mcpServers || {},
      project: project.mcpServers || {},
      connectors,
      perProjectState,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT (upsert) a server in a scope
router.put("/api/mcp/:scope/:name", async (req, res) => {
  try {
    const { scope, name } = req.params;
    const config = req.body;
    if (scope === "global") {
      const data = await readGlobalClaude();
      if (!data.mcpServers) data.mcpServers = {};
      data.mcpServers[name] = config;
      await writeGlobalClaude(data);
    } else {
      const data = await readProjectMcp();
      if (!data.mcpServers) data.mcpServers = {};
      data.mcpServers[name] = config;
      await writeProjectMcp(data);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE a server from a scope
router.delete("/api/mcp/:scope/:name", async (req, res) => {
  try {
    const { scope, name } = req.params;
    if (scope === "global") {
      const data = await readGlobalClaude();
      delete (data.mcpServers || {})[name];
      await writeGlobalClaude(data);
    } else {
      const data = await readProjectMcp();
      delete (data.mcpServers || {})[name];
      await writeProjectMcp(data);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
