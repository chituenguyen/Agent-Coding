import { Router } from "express";
import { readFile, writeFile, stat, mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import crypto from "crypto";
import { spawn } from "child_process";

import { WORKSPACE, GLOBAL_CLAUDE_JSON, attachmentsDir } from "../lib/paths.js";
import { getRepos } from "../lib/mcp-config.js";
import { readUsageEntries } from "../lib/usage.js";
import { runPromptEnhancer } from "../lib/prompt-enhancer.js";
import { getDb } from "../memory/db.js";
import { recallContext } from "../memory/recall.js";
import { isRemoteRequest } from "./remote.js";

const router = Router();

router.post("/api/browse-folder", async (req, res) => {
  // Remote devices cannot trigger an osascript dialog on the host Mac.
  if (isRemoteRequest(req)) {
    return res.json({ remote: true });
  }

  const { prompt: dialogPrompt = "Select repository folder" } = req.body || {};
  const escaped = dialogPrompt.replace(/'/g, "\\'");
  const proc = spawn(
    `osascript -e 'POSIX path of (choose folder with prompt "${escaped}")'`,
    [],
    { shell: true },
  );
  let out = "",
    err = "";
  proc.stdout.on("data", (c) => {
    out += c.toString();
  });
  proc.stderr.on("data", (c) => {
    err += c.toString();
  });
  proc.on("close", (code) => {
    if (code !== 0) return res.status(400).json({ cancelled: true });
    res.json({ path: out.trim().replace(/\/$/, "") });
  });
  proc.on("error", (e) => res.status(500).json({ error: e.message }));
});

router.post("/api/improve-prompt", async (req, res) => {
  const { description, mode, targetRepo } = req.body;
  if (!description?.trim())
    return res.status(400).json({ error: "description required" });
  if (!targetRepo?.trim())
    return res.status(400).json({ error: "targetRepo required" });
  await runPromptEnhancer({ description, mode, targetRepo }, res);
});

router.post("/api/fs/validate-path", async (req, res) => {
  try {
    const raw = (req.body?.path || "").trim();
    if (!raw)
      return res.status(400).json({ ok: false, error: "path required" });

    // Tilde expansion — phone users will type ~/Desktop/foo
    const expanded = raw.startsWith("~")
      ? path.join(process.env.HOME || "", raw.slice(1))
      : raw;

    // Must be absolute after expansion
    if (!path.isAbsolute(expanded)) {
      return res
        .status(400)
        .json({ ok: false, error: "path must be absolute" });
    }

    const resolved = path.resolve(expanded);

    // Existence + directory check (also catches non-existent paths)
    const s = await stat(resolved);
    if (!s.isDirectory()) {
      return res.status(400).json({ ok: false, error: "not a directory" });
    }

    res.json({ ok: true, path: resolved });
  } catch (err) {
    if (err.code === "ENOENT") {
      return res.status(400).json({ ok: false, error: "path does not exist" });
    }
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get("/api/fs/recent-paths", async (req, res) => {
  try {
    const home = process.env.HOME || "";
    const recents = [];

    // Repos registered in mcp-server.json
    const repos = await getRepos();
    for (const r of repos) {
      if (r.path) recents.push({ path: r.path, label: r.name });
    }

    // Always-on suggestions
    if (home) recents.push({ path: home, label: "Home" });
    const desktop = path.join(home, "Desktop");
    if (existsSync(desktop)) recents.push({ path: desktop, label: "Desktop" });

    // Dedupe by path, preserve first-seen order, cap at 10
    const seen = new Set();
    const deduped = [];
    for (const r of recents) {
      if (seen.has(r.path)) continue;
      seen.add(r.path);
      deduped.push(r);
      if (deduped.length >= 10) break;
    }

    res.json({ paths: deduped });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

async function ensureAttachmentsDir() {
  if (!existsSync(attachmentsDir()))
    await mkdir(attachmentsDir(), { recursive: true });
}

function sanitizeFilename(name) {
  return (name || "file").replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 80);
}

router.post("/api/uploads", async (req, res) => {
  try {
    const { filename, data, contentType } = req.body || {};
    if (!filename || !data)
      return res.status(400).json({ error: "filename and data required" });
    const base64 = String(data).replace(/^data:[^;]+;base64,/, "");
    const buf = Buffer.from(base64, "base64");
    if (buf.length > 15 * 1024 * 1024)
      return res.status(413).json({ error: "File too large (max 15 MB)" });
    await ensureAttachmentsDir();
    const id = crypto.randomUUID().slice(0, 8);
    const safe = sanitizeFilename(filename);
    const finalName = `${id}-${safe}`;
    const fullPath = path.join(attachmentsDir(), finalName);
    await writeFile(fullPath, buf);
    res.json({
      path: fullPath,
      filename,
      contentType: contentType || null,
      size: buf.length,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/api/usage", async (req, res) => {
  try {
    const entries = await readUsageEntries(2000);
    const totals = {
      cost_usd: 0,
      runs: entries.length,
      errors: 0,
      tokens: { input: 0, output: 0, cache_read: 0, cache_creation: 0 },
      duration_ms: 0,
    };
    const byKind = {};
    const byModel = {};
    const byDate = {};
    for (const e of entries) {
      totals.cost_usd += e.cost_usd || 0;
      totals.duration_ms += e.duration_ms || 0;
      if (e.is_error) totals.errors += 1;
      for (const k of ["input", "output", "cache_read", "cache_creation"]) {
        totals.tokens[k] += e.tokens?.[k] || 0;
      }
      const kk = e.kind || "unknown";
      byKind[kk] = byKind[kk] || { runs: 0, cost_usd: 0 };
      byKind[kk].runs += 1;
      byKind[kk].cost_usd += e.cost_usd || 0;
      const m = e.model || "unknown";
      byModel[m] = byModel[m] || { runs: 0, cost_usd: 0 };
      byModel[m].runs += 1;
      byModel[m].cost_usd += e.cost_usd || 0;
      const day = (e.at || "").slice(0, 10);
      if (day) {
        byDate[day] = byDate[day] || { runs: 0, cost_usd: 0 };
        byDate[day].runs += 1;
        byDate[day].cost_usd += e.cost_usd || 0;
      }
    }
    const recent = entries.slice(-50).reverse();
    res.json({ totals, byKind, byModel, byDate, recent });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/api/memory/recall", async (req, res) => {
  try {
    const db = await getDb();
    const { q, file, project, limit, cutoff } = req.query;
    const hits = recallContext(
      {
        q: q || "",
        file: file || null,
        project: project || null,
        limit: Math.min(parseInt(limit || "5", 10), 20),
        cutoff: cutoff != null ? parseFloat(cutoff) : 0.25,
      },
      db,
    );
    res.json({ hits, count: hits.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/api/account", async (req, res) => {
  try {
    const raw = await readFile(GLOBAL_CLAUDE_JSON, "utf8");
    const data = JSON.parse(raw);
    const o = data.oauthAccount || {};
    res.json({
      email: o.emailAddress || null,
      organizationName: o.organizationName || null,
      organizationRole: o.organizationRole || null,
      workspaceName: o.workspaceName || null,
      userID: data.userID || null,
      claudeVersion: data.firstStartTime
        ? new Date(data.firstStartTime).toISOString().slice(0, 10)
        : null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
