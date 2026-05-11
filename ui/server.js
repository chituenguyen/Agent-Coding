import express from "express";
import { createServer } from "http";
import { WebSocketServer } from "ws";
import matter from "gray-matter";
import { spawn } from "child_process";
import {
  readdir,
  readFile,
  writeFile,
  appendFile,
  mkdir,
  rm,
  stat,
} from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";
import QRCode from "qrcode";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// server.js lives in ui/, workspace is the parent
const WORKSPACE = path.resolve(__dirname, "..");

// ─── remote control (cloudflare tunnel + cookie pairing) ───────────────────

const CLOUDFLARED_BIN = path.join(
  __dirname,
  "node_modules/cloudflared/bin/cloudflared",
);

let remoteSession = {
  active: false,
  token: null, // one-time pairing token in QR URL
  sessionId: null, // cookie value for paired device
  pairedAt: null,
  tunnelUrl: null,
  tunnelProc: null, // cloudflared child process
};

function parseCookies(cookieHeader) {
  const cookies = {};
  if (!cookieHeader) return cookies;
  cookieHeader.split(";").forEach((c) => {
    const [k, ...v] = c.trim().split("=");
    if (k) cookies[k] = v.join("=");
  });
  return cookies;
}

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });

app.use(express.json({ limit: "20mb" }));

// Remote access gate — cookie-based (works through tunnels)
app.use((req, res, next) => {
  const clientIp = req.ip || req.socket.remoteAddress;
  const isLocal = ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(clientIp);
  if (isLocal) return next();

  if (!remoteSession.active)
    return res.status(403).send("Remote access not enabled");

  // First connection with pairing token → set session cookie
  const pairToken = req.query.pair;
  if (pairToken) {
    if (pairToken !== remoteSession.token)
      return res.status(403).send("Invalid pairing token");
    if (remoteSession.sessionId)
      return res.status(403).send("Another device already paired");
    // Pair this device
    const sid = crypto.randomUUID();
    remoteSession.sessionId = sid;
    remoteSession.pairedAt = Date.now();
    res.cookie("remote_sid", sid, {
      httpOnly: true,
      sameSite: "lax",
      maxAge: 24 * 60 * 60 * 1000,
    });
    // Redirect to remove ?pair= from URL
    const clean =
      req.originalUrl.replace(/[?&]pair=[^&]+/, "").replace(/^\?$/, "") || "/";
    return res.redirect(clean);
  }

  // Check session cookie
  const cookies = parseCookies(req.headers.cookie);
  if (cookies.remote_sid && cookies.remote_sid === remoteSession.sessionId)
    return next();

  return res.status(403).send("Not paired. Scan the QR code first.");
});

// Serve built frontend in production
if (existsSync(path.join(__dirname, "dist"))) {
  app.use(express.static(path.join(__dirname, "dist")));
}

// ─── helpers ────────────────────────────────────────────────────────────────

async function readIfExists(filePath) {
  if (!existsSync(filePath)) return null;
  return readFile(filePath, "utf8");
}

function deriveStatus(taskDir) {
  const has = (f) => existsSync(path.join(taskDir, f));
  if (has("commit.md")) return "done";
  if (has("review/approval.md")) return "approved";
  if (has("review/fix-log.md")) return "fixed";
  if (has("review/issues.md")) return "issues";
  if (has("review/backend-summary.md") || has("review/frontend-summary.md"))
    return "coded";
  if (has("SPEC.md")) return "planned";
  if (has("input.md")) return "created";
  return "unknown";
}

function parseInputMd(content) {
  const get = (key) => {
    const m = content.match(new RegExp(`\\*\\*${key}:\\*\\*\\s*(.+)`));
    return m ? m[1].trim() : "";
  };
  // Description may span multiple lines (e.g. XML-structured prompts)
  const getDescription = () => {
    const m = content.match(
      /\*\*Description:\*\*\s*([\s\S]+?)(?=\n\*\*[A-Za-z]|\n\n## |\n\n\*\*|$)/,
    );
    if (!m) return get("Description");
    return m[1].trim();
  };
  return {
    taskId: get("Task ID"),
    project: get("Project"),
    created: get("Created"),
    description: getDescription(),
    targetPath: get("Path"),
  };
}

// ─── tasks ──────────────────────────────────────────────────────────────────

app.get("/api/tasks", async (req, res) => {
  try {
    const tasksDir = path.join(WORKSPACE, "tasks");
    if (!existsSync(tasksDir)) return res.json([]);

    const projects = await readdir(tasksDir);
    const tasks = [];

    for (const project of projects) {
      const projectDir = path.join(tasksDir, project);
      const s = await stat(projectDir);
      if (!s.isDirectory()) continue;

      const taskIds = await readdir(projectDir);
      for (const taskId of taskIds) {
        const taskDir = path.join(projectDir, taskId);
        const ts = await stat(taskDir);
        if (!ts.isDirectory()) continue;

        const inputContent = await readIfExists(path.join(taskDir, "input.md"));
        const meta = inputContent ? parseInputMd(inputContent) : {};

        const taskPath = `tasks/${project}/${taskId}`;
        const fsStatus = deriveStatus(taskDir);
        // Cross-reference with running workflows + queue for real-time status
        const wf = runningWorkflows.get(taskPath);
        const isRunning =
          !!(wf && wf.exitCode === null) ||
          !!(queueRunning && queueRunning.path === taskPath);

        tasks.push({
          taskId,
          project,
          description: meta.description || taskId,
          created: meta.created || "",
          targetPath: meta.targetPath || "",
          status: fsStatus,
          running: isRunning,
        });
      }
    }

    tasks.sort((a, b) => b.taskId.localeCompare(a.taskId));
    res.json(tasks);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/tasks/:project/:taskId", async (req, res) => {
  try {
    const { project, taskId } = req.params;
    const taskDir = path.join(WORKSPACE, "tasks", project, taskId);
    if (!existsSync(taskDir))
      return res.status(404).json({ error: "Task not found" });

    const inputContent = await readIfExists(path.join(taskDir, "input.md"));
    const meta = inputContent ? parseInputMd(inputContent) : {};

    const taskPath = `tasks/${project}/${taskId}`;
    const wf = runningWorkflows.get(taskPath);
    const isRunning = !!(wf && wf.exitCode === null);

    res.json({
      taskId,
      project,
      description: meta.description || taskId,
      created: meta.created || "",
      targetPath: meta.targetPath || "",
      status: deriveStatus(taskDir),
      running: isRunning,
      files: {
        spec: await readIfExists(path.join(taskDir, "SPEC.md")),
        approval: await readIfExists(path.join(taskDir, "review/approval.md")),
        issues: await readIfExists(path.join(taskDir, "review/issues.md")),
        fixLog: await readIfExists(path.join(taskDir, "review/fix-log.md")),
        backendSummary: await readIfExists(
          path.join(taskDir, "review/backend-summary.md"),
        ),
        frontendSummary: await readIfExists(
          path.join(taskDir, "review/frontend-summary.md"),
        ),
        commit: await readIfExists(path.join(taskDir, "commit.md")),
        input: inputContent,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/tasks/:project/:taskId", async (req, res) => {
  try {
    const { project, taskId } = req.params;
    const taskDir = path.join(WORKSPACE, "tasks", project, taskId);
    if (!existsSync(taskDir))
      return res.status(404).json({ error: "Task not found" });
    await rm(taskDir, { recursive: true });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── subtasks (related tasks on completed tasks) ─────────────────────────────

app.post("/api/tasks/:project/:taskId/subtasks", async (req, res) => {
  try {
    const { project, taskId } = req.params;
    const { description } = req.body;
    if (!description?.trim())
      return res.status(400).json({ error: "description required" });

    const taskDir = path.join(WORKSPACE, "tasks", project, taskId);
    if (!existsSync(taskDir))
      return res.status(404).json({ error: "Task not found" });

    const now = new Date();
    const pad = (n, l = 2) => String(n).padStart(l, "0");
    const dateStr = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
    const timeStr = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    const slug = description
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40);
    const subtaskId = `${dateStr}-${timeStr}-${slug}`;
    const subtaskDir = path.join(taskDir, "subtasks", subtaskId);

    await mkdir(path.join(subtaskDir, "review"), { recursive: true });
    await mkdir(path.join(subtaskDir, "research"), { recursive: true });
    await writeFile(
      path.join(subtaskDir, "input.md"),
      `# Sub-task Input\n\n**Parent Task:** ${taskId}\n**Project:** ${project}\n**Created:** ${now.toISOString()}\n**Description:** ${description.trim()}\n\n## User's Request\n\n${description.trim()}\n`,
    );

    res.json({
      subtaskId,
      subtaskPath: `tasks/${project}/${taskId}/subtasks/${subtaskId}`,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/tasks/:project/:taskId/subtasks", async (req, res) => {
  try {
    const { project, taskId } = req.params;
    const subtasksDir = path.join(
      WORKSPACE,
      "tasks",
      project,
      taskId,
      "subtasks",
    );
    if (!existsSync(subtasksDir)) return res.json([]);

    const queue = await readQueue();
    const dirs = await readdir(subtasksDir);
    const subtasks = [];
    for (const subtaskId of dirs) {
      const subtaskDir = path.join(subtasksDir, subtaskId);
      const s = await stat(subtaskDir);
      if (!s.isDirectory()) continue;
      const inputMd = await readIfExists(path.join(subtaskDir, "input.md"));
      const commitMd = await readIfExists(path.join(subtaskDir, "commit.md"));
      const approvalMd = await readIfExists(
        path.join(subtaskDir, "review", "approval.md"),
      );
      const issuesMd = await readIfExists(
        path.join(subtaskDir, "review", "issues.md"),
      );
      const subtaskPath = `tasks/${project}/${taskId}/subtasks/${subtaskId}`;
      // cross-ref running processes + queue for live status
      const wf = runningWorkflows.get(subtaskPath);
      const isProcessRunning = wf && wf.exitCode === null;
      const qItem = queue.tasks.find(
        (t) => t.type === "subtask" && t.subtask_path === subtaskPath,
      );
      let status;
      if (isProcessRunning) status = "running";
      else if (qItem?.status === "running") status = "running";
      else if (qItem?.status === "pending") status = "queued";
      else if (qItem?.status === "failed") status = "failed";
      else if (commitMd) status = "done";
      else if (approvalMd) status = "approved";
      else if (issuesMd) status = "issues";
      else if (existsSync(path.join(subtaskDir, "SPEC.md"))) status = "planned";
      else status = "created";
      // For running items, derive the sub-step from filesystem
      const subStep = isProcessRunning
        ? approvalMd
          ? "approved"
          : issuesMd
            ? "issues"
            : existsSync(
                  path.join(subtaskDir, "review", "backend-summary.md"),
                ) ||
                existsSync(
                  path.join(subtaskDir, "review", "frontend-summary.md"),
                )
              ? "coded"
              : existsSync(path.join(subtaskDir, "SPEC.md"))
                ? "planned"
                : "created"
        : null;
      const description =
        inputMd
          ?.match(
            /\*\*Description:\*\*\s*([\s\S]+?)(?=\n\*\*[A-Za-z]|\n\n## |\n\n\*\*|$)/,
          )?.[1]
          ?.trim() || subtaskId;
      subtasks.push({
        subtaskId,
        subtaskPath,
        status,
        subStep,
        description,
        inputMd,
      });
    }
    subtasks.sort((a, b) => a.subtaskId.localeCompare(b.subtaskId));
    res.json(subtasks);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── fixes (bug fix runs on completed tasks) ─────────────────────────────────

app.post("/api/tasks/:project/:taskId/fixes", async (req, res) => {
  try {
    const { project, taskId } = req.params;
    const { bugDescription } = req.body;
    if (!bugDescription?.trim())
      return res.status(400).json({ error: "bugDescription required" });

    const taskDir = path.join(WORKSPACE, "tasks", project, taskId);
    if (!existsSync(taskDir))
      return res.status(404).json({ error: "Task not found" });

    const now = new Date();
    const pad = (n, l = 2) => String(n).padStart(l, "0");
    const dateStr = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
    const timeStr = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    const slug = bugDescription
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40);
    const fixId = `${dateStr}-${timeStr}-${slug}`;
    const fixDir = path.join(taskDir, "fixes", fixId);

    await mkdir(fixDir, { recursive: true });
    await writeFile(
      path.join(fixDir, "bug.md"),
      `# Bug Report\n\n**Task:** ${taskId}\n**Project:** ${project}\n**Reported:** ${now.toISOString()}\n\n## Description\n\n${bugDescription.trim()}\n`,
    );

    res.json({ fixId, fixPath: `tasks/${project}/${taskId}/fixes/${fixId}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/tasks/:project/:taskId/fixes", async (req, res) => {
  try {
    const { project, taskId } = req.params;
    const fixesDir = path.join(WORKSPACE, "tasks", project, taskId, "fixes");
    if (!existsSync(fixesDir)) return res.json([]);

    const queue = await readQueue();
    const dirs = await readdir(fixesDir);
    const fixes = [];
    for (const fixId of dirs) {
      const fixDir = path.join(fixesDir, fixId);
      const s = await stat(fixDir);
      if (!s.isDirectory()) continue;
      const bugMd = await readIfExists(path.join(fixDir, "bug.md"));
      const reviewMd = await readIfExists(path.join(fixDir, "review.md"));
      const commitMd = await readIfExists(path.join(fixDir, "commit.md"));
      const fixPath = `tasks/${project}/${taskId}/fixes/${fixId}`;
      // cross-ref running processes + queue for live status
      const wf = runningWorkflows.get(fixPath);
      const isProcessRunning = wf && wf.exitCode === null;
      const qItem = queue.tasks.find(
        (t) => t.type === "fix" && t.fix_path === fixPath,
      );
      let status;
      if (isProcessRunning) status = "running";
      else if (qItem?.status === "running") status = "running";
      else if (qItem?.status === "pending") status = "queued";
      else if (qItem?.status === "failed") status = "failed";
      else if (commitMd) status = "fixed";
      else if (reviewMd?.includes("APPROVED")) status = "approved";
      else if (reviewMd) status = "issues";
      else if (existsSync(path.join(fixDir, "fix-log.md"))) status = "debugged";
      else if (existsSync(path.join(fixDir, "root-cause.md")))
        status = "investigated";
      else status = "created";
      // For running items, derive the sub-step from filesystem
      const subStep = isProcessRunning
        ? commitMd
          ? "fixed"
          : reviewMd?.includes("APPROVED")
            ? "approved"
            : reviewMd
              ? "issues"
              : existsSync(path.join(fixDir, "fix-log.md"))
                ? "debugged"
                : existsSync(path.join(fixDir, "root-cause.md"))
                  ? "investigated"
                  : "created"
        : null;
      fixes.push({ fixId, fixPath, status, subStep, bugMd });
    }
    fixes.sort((a, b) => a.fixId.localeCompare(b.fixId));
    res.json(fixes);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Reset a fix or subtask (delete generated files, keep input)
app.post("/api/tasks/:project/:taskId/fixes/:fixId/reset", async (req, res) => {
  try {
    const { project, taskId, fixId } = req.params;
    const fixDir = path.join(
      WORKSPACE,
      "tasks",
      project,
      taskId,
      "fixes",
      fixId,
    );
    if (!existsSync(fixDir))
      return res.status(404).json({ error: "Fix not found" });
    if (existsSync(path.join(fixDir, "commit.md")))
      return res.status(400).json({ error: "Cannot reset a completed fix" });
    const entries = await readdir(fixDir);
    for (const entry of entries) {
      if (entry === "input.md" || entry === "bug.md") continue;
      await rm(path.join(fixDir, entry), { recursive: true });
    }
    // Clear queue entry if exists
    const q = await readQueue();
    const fixPath = `tasks/${project}/${taskId}/fixes/${fixId}`;
    q.tasks = q.tasks.filter(
      (t) => !(t.type === "fix" && t.fix_path === fixPath),
    );
    await writeQueue(q);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post(
  "/api/tasks/:project/:taskId/subtasks/:subtaskId/reset",
  async (req, res) => {
    try {
      const { project, taskId, subtaskId } = req.params;
      const subtaskDir = path.join(
        WORKSPACE,
        "tasks",
        project,
        taskId,
        "subtasks",
        subtaskId,
      );
      if (!existsSync(subtaskDir))
        return res.status(404).json({ error: "Sub-task not found" });
      if (existsSync(path.join(subtaskDir, "commit.md")))
        return res
          .status(400)
          .json({ error: "Cannot reset a completed sub-task" });
      const entries = await readdir(subtaskDir);
      for (const entry of entries) {
        if (entry === "input.md") continue;
        await rm(path.join(subtaskDir, entry), { recursive: true });
      }
      // Recreate empty dirs
      await mkdir(path.join(subtaskDir, "research"), { recursive: true });
      await mkdir(path.join(subtaskDir, "review"), { recursive: true });
      // Clear queue entry if exists
      const q = await readQueue();
      const subtaskPath = `tasks/${project}/${taskId}/subtasks/${subtaskId}`;
      q.tasks = q.tasks.filter(
        (t) => !(t.type === "subtask" && t.subtask_path === subtaskPath),
      );
      await writeQueue(q);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },
);

app.delete("/api/tasks/:project/:taskId/fixes/:fixId", async (req, res) => {
  try {
    const { project, taskId, fixId } = req.params;
    const fixDir = path.join(
      WORKSPACE,
      "tasks",
      project,
      taskId,
      "fixes",
      fixId,
    );
    if (!existsSync(fixDir))
      return res.status(404).json({ error: "Fix not found" });
    await rm(fixDir, { recursive: true });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete(
  "/api/tasks/:project/:taskId/subtasks/:subtaskId",
  async (req, res) => {
    try {
      const { project, taskId, subtaskId } = req.params;
      const subtaskDir = path.join(
        WORKSPACE,
        "tasks",
        project,
        taskId,
        "subtasks",
        subtaskId,
      );
      if (!existsSync(subtaskDir))
        return res.status(404).json({ error: "Sub-task not found" });
      await rm(subtaskDir, { recursive: true });
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },
);

app.post("/api/tasks", async (req, res) => {
  try {
    const { description, targetPath, ticketId } = req.body;
    if (!description?.trim())
      return res.status(400).json({ error: "description required" });

    const project = targetPath
      ? path
          .basename(targetPath)
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
      : "workspace";

    const now = new Date();
    const pad = (n, l = 2) => String(n).padStart(l, "0");
    const dateStr = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
    const timeStr = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    const slug = ticketId?.trim()
      ? ticketId
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "")
      : description
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "")
          .slice(0, 50);
    const taskId = `${dateStr}-${timeStr}-${slug}`;
    const taskDir = path.join(WORKSPACE, "tasks", project, taskId);

    await mkdir(path.join(taskDir, "code"), { recursive: true });
    await mkdir(path.join(taskDir, "review"), { recursive: true });
    await mkdir(path.join(taskDir, "research"), { recursive: true });

    // Create project context if new
    const contextPath = path.join(WORKSPACE, "projects", project, "context.md");
    if (!existsSync(contextPath)) {
      await mkdir(path.dirname(contextPath), { recursive: true });
      await writeFile(
        contextPath,
        `# Project Context: ${project}

**Repo path:** ${targetPath || "N/A"}

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

    // Write input.md
    // Check for per-project MCP config
    const mcpConfig = await readProjectMcpConfig(project);
    const mcpServerNames = Object.keys(mcpConfig.mcpServers || {});
    const mcpSection =
      mcpServerNames.length > 0
        ? `\n## Available MCP Tools\n\nThis project has ${mcpServerNames.length} MCP server(s) configured: **${mcpServerNames.join(", ")}**.\nThese tools are automatically available to all agents during the workflow.\n\n${mcpServerNames
            .map((name) => {
              const cfg = mcpConfig.mcpServers[name];
              return `- **${name}**: \`${cfg.command} ${(cfg.args || []).join(" ")}\``;
            })
            .join(
              "\n",
            )}\n\nAgents SHOULD use these MCP tools to explore the codebase (query symbols, check impact, understand code structure) before making changes.\n`
        : "";

    await writeFile(
      path.join(taskDir, "input.md"),
      `# Task Input

**Task ID:** ${taskId}
**Project:** ${project}
**Created:** ${now.toISOString()}
**Description:** ${description}

## Target Repository

**Path:** ${targetPath || "N/A"}
**Name:** ${targetPath ? path.basename(targetPath) : "N/A"}

## Project Context

See: projects/${project}/context.md
${mcpSection}
## User's Request

${description}
`,
    );

    // Write target-info.md if target provided
    if (targetPath) {
      await writeFile(
        path.join(taskDir, "target-info.md"),
        `# Target Repository Info

**Path:** ${targetPath}
**Name:** ${path.basename(targetPath)}
**Project:** ${project}
**Project context:** projects/${project}/context.md
`,
      );
    }

    // Auto-add target repo to user's additionalDirectories so subagents can access it
    if (targetPath) {
      const userSettingsPath = path.join(
        process.env.HOME,
        ".claude",
        "settings.json",
      );
      try {
        const raw = await readFile(userSettingsPath, "utf8");
        const settings = JSON.parse(raw);
        const dirs = settings.permissions?.additionalDirectories || [];
        if (!dirs.includes(targetPath)) {
          dirs.push(targetPath);
          if (!settings.permissions) settings.permissions = {};
          settings.permissions.additionalDirectories = dirs;
          await writeFile(
            userSettingsPath,
            JSON.stringify(settings, null, 2) + "\n",
          );
        }
      } catch {
        /* ignore — settings file may not exist */
      }
    }

    res.json({ taskId, project, taskDir: `tasks/${project}/${taskId}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── mcp_server.json (single source of truth for catalog + repositories) ────

const mcpServerPath = path.join(WORKSPACE, "mcp_server.json");

async function readMcpServer() {
  try {
    return JSON.parse(await readFile(mcpServerPath, "utf8"));
  } catch {
    return { repositories: [], catalog: [] };
  }
}

async function writeMcpServer(data) {
  await writeFile(mcpServerPath, JSON.stringify(data, null, 2) + "\n");
}

// ─── catalog ─────────────────────────────────────────────────────────────────

app.get("/api/catalog", async (req, res) => {
  const data = await readMcpServer();
  res.json(data.catalog || []);
});

app.post("/api/catalog", async (req, res) => {
  try {
    const item = req.body;
    if (!item?.name?.trim())
      return res.status(400).json({ error: "name required" });
    const data = await readMcpServer();
    const idx = (data.catalog || []).findIndex((c) => c.name === item.name);
    if (idx >= 0) data.catalog[idx] = item;
    else (data.catalog = data.catalog || []).push(item);
    await writeMcpServer(data);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/catalog/:name", async (req, res) => {
  try {
    const data = await readMcpServer();
    data.catalog = (data.catalog || []).filter(
      (c) => c.name !== req.params.name,
    );
    await writeMcpServer(data);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── repositories (per-project MCP management) ─────────────────────────────

async function readProjectMcpConfig(project) {
  const data = await readMcpServer();
  const repo = (data.repositories || []).find((r) => r.name === project);
  if (repo) return { mcpServers: repo.mcpServers || {} };
  // fallback: read legacy projects/<name>/mcp.json
  try {
    return JSON.parse(
      await readFile(
        path.join(WORKSPACE, "projects", project, "mcp.json"),
        "utf8",
      ),
    );
  } catch {
    return { mcpServers: {} };
  }
}

async function writeProjectMcpConfig(project, mcpServers) {
  const data = await readMcpServer();
  const repo = (data.repositories || []).find((r) => r.name === project);
  if (repo) {
    repo.mcpServers = mcpServers;
    await writeMcpServer(data);
    // sync .mcp.json for the workspace repo so Claude Code picks up changes
    if (repo.path === WORKSPACE) {
      const dotMcp = {
        mcpServers: Object.fromEntries(
          Object.entries(mcpServers).map(([k, v]) => {
            const { type, ...rest } = v;
            return [k, rest];
          }),
        ),
      };
      await writeFile(
        path.join(WORKSPACE, ".mcp.json"),
        JSON.stringify(dotMcp, null, 2) + "\n",
      );
    }
    // sync projects/{name}/mcp.json so claude CLI --mcp-config still works for workflows
    const legacyPath = path.join(WORKSPACE, "projects", project, "mcp.json");
    if (existsSync(path.dirname(legacyPath))) {
      await writeFile(
        legacyPath,
        JSON.stringify({ mcpServers }, null, 2) + "\n",
      );
    }
  }
}

async function migrateProjectMcpFiles() {
  const data = await readMcpServer();
  let changed = false;
  for (const repo of data.repositories || []) {
    if (repo.mcpServers) continue;
    // workspace repo: read from .mcp.json
    if (repo.path === WORKSPACE) {
      try {
        const dotMcp = JSON.parse(
          await readFile(path.join(WORKSPACE, ".mcp.json"), "utf8"),
        );
        repo.mcpServers = Object.fromEntries(
          Object.entries(dotMcp.mcpServers || {}).map(([k, v]) => [
            k,
            { type: "stdio", ...v },
          ]),
        );
        changed = true;
      } catch {
        repo.mcpServers = {};
      }
    } else {
      const legacyPath = path.join(
        WORKSPACE,
        "projects",
        repo.name,
        "mcp.json",
      );
      try {
        const legacy = JSON.parse(await readFile(legacyPath, "utf8"));
        repo.mcpServers = legacy.mcpServers || {};
        changed = true;
      } catch {
        repo.mcpServers = {};
      }
    }
  }
  if (changed) await writeMcpServer(data);
}

async function getRepos() {
  const data = await readMcpServer();
  // Migrate from old repositories.json if mcp_server.json has no repos yet
  if (!data.repositories || data.repositories.length === 0) {
    const oldPath = path.join(WORKSPACE, "repositories.json");
    if (existsSync(oldPath)) {
      try {
        data.repositories = JSON.parse(await readFile(oldPath, "utf8"));
        await writeMcpServer(data);
      } catch {
        data.repositories = [];
      }
    } else {
      // Scan projects/ dir as fallback
      const projectsDir = path.join(WORKSPACE, "projects");
      if (existsSync(projectsDir)) {
        const dirs = await readdir(projectsDir);
        data.repositories = [];
        for (const name of dirs) {
          const s = await stat(path.join(projectsDir, name));
          if (!s.isDirectory()) continue;
          let repoPath = "";
          const contextFile = path.join(projectsDir, name, "context.md");
          if (existsSync(contextFile)) {
            const content = await readFile(contextFile, "utf8");
            const m = content.match(/\*\*Repo path:\*\*\s*(.+)/);
            if (m && m[1].trim() !== "N/A") repoPath = m[1].trim();
          }
          data.repositories.push({
            name,
            path: repoPath,
            addedAt: new Date().toISOString(),
          });
        }
        await writeMcpServer(data);
      }
    }
  }
  return data.repositories || [];
}

app.get("/api/repositories", async (req, res) => {
  try {
    const repos = await getRepos();
    const enriched = await Promise.all(
      repos.map(async (r) => {
        const mcpConfig = await readProjectMcpConfig(r.name);
        return {
          name: r.name,
          repoPath: r.path || "",
          mcpServerCount: Object.keys(mcpConfig.mcpServers || {}).length,
        };
      }),
    );
    res.json(enriched);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/repositories", async (req, res) => {
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

    // Create projects/<name>/context.md if not exists
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

app.delete("/api/repositories/:name", async (req, res) => {
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

app.get("/api/repositories/:project/mcp", async (req, res) => {
  try {
    res.json(await readProjectMcpConfig(req.params.project));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/repositories/:project/mcp/:serverName", async (req, res) => {
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

app.delete("/api/repositories/:project/mcp/:serverName", async (req, res) => {
  try {
    const { project, serverName } = req.params;
    const config = await readProjectMcpConfig(project);
    delete config.mcpServers[serverName];
    await writeProjectMcpConfig(project, config.mcpServers);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── graph (GitNexus integration) ───────────────────────────────────────────

app.get("/api/repositories/:project/graph", async (req, res) => {
  try {
    const { project } = req.params;
    const contextFile = path.join(WORKSPACE, "projects", project, "context.md");
    if (!existsSync(contextFile))
      return res.status(404).json({ error: "Project not found" });

    // Get repo path from context.md
    const content = await readFile(contextFile, "utf8");
    const m = content.match(/\*\*Repo path:\*\*\s*(.+)/);
    if (!m || m[1].trim() === "N/A")
      return res.status(400).json({ error: "No repo path" });
    const repoPath = m[1].trim();

    // Check if gitnexus is indexed
    if (!existsSync(path.join(repoPath, ".gitnexus"))) {
      return res.json({ indexed: false, nodes: [], edges: [] });
    }

    // Run cypher queries for nodes and edges
    const runCypher = (query) =>
      new Promise((resolve, reject) => {
        const proc = spawn("npx", ["-y", "gitnexus@latest", "cypher", query], {
          cwd: repoPath,
          stdio: ["ignore", "pipe", "pipe"],
        });
        let out = "";
        proc.stdout.on("data", (c) => {
          out += c.toString();
        });
        proc.on("close", (code) => {
          if (code !== 0) {
            resolve({ markdown: "", row_count: 0 });
            return;
          }
          try {
            resolve(JSON.parse(out));
          } catch {
            resolve({ markdown: "", row_count: 0 });
          }
        });
        proc.on("error", () => resolve({ markdown: "", row_count: 0 }));
      });

    const parseTable = (md) => {
      if (!md) return [];
      const lines = md.trim().split("\n");
      if (lines.length < 3) return [];
      const headers = lines[0]
        .split("|")
        .map((h) => h.trim())
        .filter(Boolean);
      return lines.slice(2).map((line) => {
        const vals = line
          .split("|")
          .map((v) => v.trim())
          .filter(Boolean);
        return Object.fromEntries(headers.map((h, i) => [h, vals[i] || ""]));
      });
    };

    const [nodesResult, edgesResult] = await Promise.all([
      runCypher(
        "MATCH (n) WHERE labels(n) <> 'Folder' RETURN id(n) as id, n.name as name, labels(n) as kind, n.filePath as file",
      ),
      runCypher(
        "MATCH (n)-[r:CodeRelation]->(m) WHERE labels(n) <> 'Folder' AND labels(m) <> 'Folder' RETURN id(n) as source, id(m) as target, r.type as rel, n.name as sourceName, m.name as targetName",
      ),
    ]);

    const nodes = parseTable(nodesResult.markdown);
    const edges = parseTable(edgesResult.markdown);

    res.json({ indexed: true, nodes, edges });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/repositories/:project/graph/index", async (req, res) => {
  try {
    const { project } = req.params;
    const content = await readFile(
      path.join(WORKSPACE, "projects", project, "context.md"),
      "utf8",
    );
    const m = content.match(/\*\*Repo path:\*\*\s*(.+)/);
    if (!m) return res.status(400).json({ error: "No repo path" });
    const repoPath = m[1].trim();

    const proc = spawn("npx", ["-y", "gitnexus@latest", "analyze"], {
      cwd: repoPath,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    proc.stdout.on("data", (c) => {
      out += c.toString();
    });
    proc.on("close", (code) => {
      res.json({ ok: code === 0, output: out.trim() });
    });
    proc.on("error", (err) => res.status(500).json({ error: err.message }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── queue ───────────────────────────────────────────────────────────────────

const queuePath = () => path.join(WORKSPACE, "queue.json");

async function readQueue() {
  try {
    const raw = await readFile(queuePath(), "utf8");
    return JSON.parse(raw);
  } catch {
    return { tasks: [] };
  }
}

async function writeQueue(data) {
  await writeFile(queuePath(), JSON.stringify(data, null, 2));
}

app.get("/api/queue", async (req, res) => {
  try {
    res.json(await readQueue());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/queue/add", async (req, res) => {
  try {
    const {
      description,
      target,
      task_id,
      project,
      type,
      task_path,
      fix_path,
      subtask_path,
    } = req.body;
    if (!description?.trim())
      return res.status(400).json({ error: "description required" });
    const queue = await readQueue();
    queue.tasks.push({
      description: description.trim(),
      target: target?.trim() || null,
      status: "pending",
      type: type || "task", // 'task' | 'fix' | 'subtask'
      task_id: task_id || null,
      project: project || null,
      task_path: task_path || null, // for fix/subtask: parent task path
      fix_path: fix_path || null, // for type='fix'
      subtask_path: subtask_path || null, // for type='subtask'
      added_at: new Date().toISOString(),
      finished_at: null,
      error: null,
    });
    await writeQueue(queue);
    res.json({ success: true, position: queue.tasks.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/queue/clear", async (req, res) => {
  try {
    const { filter } = req.query; // 'done' | 'failed' | 'all'
    const queue = await readQueue();
    if (filter === "all") {
      queue.tasks = [];
    } else if (filter === "failed") {
      queue.tasks = queue.tasks.filter((t) => t.status !== "failed");
    } else {
      queue.tasks = queue.tasks.filter((t) => t.status !== "done");
    }
    await writeQueue(queue);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/queue/retry", async (req, res) => {
  try {
    const { index } = req.body;
    const queue = await readQueue();
    if (index < 0 || index >= queue.tasks.length)
      return res.status(400).json({ error: "Invalid index" });
    const item = queue.tasks[index];
    if (item.status !== "failed")
      return res.status(400).json({ error: "Can only retry failed items" });
    item.status = "pending";
    item.error = null;
    item.finished_at = null;
    await writeQueue(queue);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/queue/cancel", async (req, res) => {
  try {
    if (!queueRunning)
      return res.status(400).json({ error: "Nothing is running" });
    const { proc, path: trackPath } = queueRunning;
    console.log(`[Queue] Cancelling: ${trackPath}`);
    proc.kill("SIGTERM");
    // proc.on('close') handler will set status to failed and clear queueRunning
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/queue/remove", async (req, res) => {
  try {
    const { index } = req.body;
    const queue = await readQueue();
    if (index < 0 || index >= queue.tasks.length)
      return res.status(400).json({ error: "Invalid index" });
    const item = queue.tasks[index];
    if (item.status === "running")
      return res.status(400).json({ error: "Cannot remove running item" });
    queue.tasks.splice(index, 1);
    await writeQueue(queue);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/queue/reorder", async (req, res) => {
  try {
    const { fromIndex, toIndex } = req.body;
    const queue = await readQueue();
    if (
      fromIndex < 0 ||
      fromIndex >= queue.tasks.length ||
      toIndex < 0 ||
      toIndex >= queue.tasks.length
    ) {
      return res.status(400).json({ error: "Invalid index" });
    }
    const [item] = queue.tasks.splice(fromIndex, 1);
    queue.tasks.splice(toIndex, 0, item);
    await writeQueue(queue);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── settings ────────────────────────────────────────────────────────────────

const GLOBAL_SETTINGS = path.join(
  process.env.HOME || process.env.USERPROFILE,
  ".claude/settings.json",
);

async function readSettings() {
  try {
    return JSON.parse(await readFile(GLOBAL_SETTINGS, "utf8"));
  } catch {
    return {};
  }
}

app.get("/api/settings", async (req, res) => {
  try {
    res.json(await readSettings());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/settings", async (req, res) => {
  try {
    const current = await readSettings();
    const merged = deepMerge(current, req.body);
    await writeFile(GLOBAL_SETTINGS, JSON.stringify(merged, null, 2));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function deepMerge(target, source) {
  const out = { ...target };
  for (const [k, v] of Object.entries(source)) {
    if (
      v &&
      typeof v === "object" &&
      !Array.isArray(v) &&
      typeof target[k] === "object"
    )
      out[k] = deepMerge(target[k], v);
    else out[k] = v;
  }
  return out;
}

// ─── mcp ─────────────────────────────────────────────────────────────────────

const GLOBAL_CLAUDE_JSON = path.join(
  process.env.HOME || process.env.USERPROFILE,
  ".claude.json",
);
const PROJECT_MCP_JSON = path.join(WORKSPACE, ".mcp.json");

async function readGlobalClaude() {
  try {
    return JSON.parse(await readFile(GLOBAL_CLAUDE_JSON, "utf8"));
  } catch {
    return {};
  }
}
async function writeGlobalClaude(data) {
  await writeFile(GLOBAL_CLAUDE_JSON, JSON.stringify(data, null, 2));
}
async function readProjectMcp() {
  try {
    return JSON.parse(await readFile(PROJECT_MCP_JSON, "utf8"));
  } catch {
    return { mcpServers: {} };
  }
}
async function writeProjectMcp(data) {
  await writeFile(PROJECT_MCP_JSON, JSON.stringify(data, null, 2));
}

// GET both scopes
app.get("/api/mcp", async (req, res) => {
  try {
    const global = await readGlobalClaude();
    const project = await readProjectMcp();
    res.json({
      global: global.mcpServers || {},
      project: project.mcpServers || {},
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT (upsert) a server in a scope
app.put("/api/mcp/:scope/:name", async (req, res) => {
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
app.delete("/api/mcp/:scope/:name", async (req, res) => {
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

// ─── agents ─────────────────────────────────────────────────────────────────

const agentsDir = () => path.join(WORKSPACE, ".claude/agents");

app.get("/api/agents", async (req, res) => {
  try {
    const files = await readdir(agentsDir());
    const agents = await Promise.all(
      files
        .filter((f) => f.endsWith(".md"))
        .map(async (f) => {
          const raw = await readFile(path.join(agentsDir(), f), "utf8");
          const { data, content } = matter(raw);
          return {
            filename: f.replace(".md", ""),
            ...data,
            body: content.trim(),
          };
        }),
    );
    res.json(agents);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/agents", async (req, res) => {
  try {
    const { filename, name, description, model, body } = req.body;
    if (!filename) return res.status(400).json({ error: "filename required" });
    const fm = {};
    if (name) fm.name = name;
    if (description) fm.description = description;
    if (model) fm.model = model;
    const content = matter.stringify(body || "", fm);
    await writeFile(path.join(agentsDir(), `${filename}.md`), content);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/agents/:filename", async (req, res) => {
  try {
    const { name, description, model, body } = req.body;
    const fm = {};
    if (name) fm.name = name;
    if (description) fm.description = description;
    if (model) fm.model = model;
    const content = matter.stringify(body || "", fm);
    await writeFile(
      path.join(agentsDir(), `${req.params.filename}.md`),
      content,
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/agents/:filename", async (req, res) => {
  try {
    await rm(path.join(agentsDir(), `${req.params.filename}.md`));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── skills ──────────────────────────────────────────────────────────────────

const skillsDir = () => path.join(WORKSPACE, ".claude/skills");

app.get("/api/skills", async (req, res) => {
  try {
    const entries = await readdir(skillsDir(), { withFileTypes: true });
    const skills = await Promise.all(
      entries
        .filter((e) => e.isDirectory())
        .map(async (e) => {
          const skillFile = path.join(skillsDir(), e.name, "SKILL.md");
          if (!existsSync(skillFile)) return null;
          const raw = await readFile(skillFile, "utf8");
          const { data, content } = matter(raw);
          return { dirname: e.name, ...data, body: content.trim() };
        }),
    );
    res.json(skills.filter(Boolean));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/skills", async (req, res) => {
  try {
    const { dirname, name, description, userInvocable, body } = req.body;
    if (!dirname) return res.status(400).json({ error: "dirname required" });
    const skillDir = path.join(skillsDir(), dirname);
    await mkdir(skillDir, { recursive: true });
    const fm = {};
    if (name) fm.name = name;
    if (description) fm.description = description;
    if (userInvocable === false) fm["user-invocable"] = false;
    const content = matter.stringify(body || "", fm);
    await writeFile(path.join(skillDir, "SKILL.md"), content);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/skills/:dirname", async (req, res) => {
  try {
    const { name, description, userInvocable, body } = req.body;
    const skillDir = path.join(skillsDir(), req.params.dirname);
    const fm = {};
    if (name) fm.name = name;
    if (description) fm.description = description;
    if (userInvocable === false) fm["user-invocable"] = false;
    const content = matter.stringify(body || "", fm);
    await writeFile(path.join(skillDir, "SKILL.md"), content);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/skills/:dirname", async (req, res) => {
  try {
    await rm(path.join(skillsDir(), req.params.dirname), { recursive: true });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── commands ────────────────────────────────────────────────────────────────

const commandsDir = () => path.join(WORKSPACE, ".claude/commands");

app.get("/api/commands", async (req, res) => {
  try {
    const files = await readdir(commandsDir());
    const commands = await Promise.all(
      files
        .filter((f) => f.endsWith(".md"))
        .map(async (f) => {
          const content = await readFile(path.join(commandsDir(), f), "utf8");
          return { filename: f.replace(".md", ""), content };
        }),
    );
    res.json(commands);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/commands", async (req, res) => {
  try {
    const { filename, content } = req.body;
    if (!filename) return res.status(400).json({ error: "filename required" });
    await writeFile(path.join(commandsDir(), `${filename}.md`), content || "");
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/commands/:filename", async (req, res) => {
  try {
    await writeFile(
      path.join(commandsDir(), `${req.params.filename}.md`),
      req.body.content || "",
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/commands/:filename", async (req, res) => {
  try {
    await rm(path.join(commandsDir(), `${req.params.filename}.md`));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── native folder picker (macOS osascript) ─────────────────────────────────

app.post("/api/browse-folder", async (req, res) => {
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
    res.json({ path: out.trim().replace(/\/$/, "") }); // strip trailing slash
  });
  proc.on("error", (e) => res.status(500).json({ error: e.message }));
});

// ─── prompt enhancer agent ──────────────────────────────────────────────────

app.post("/api/improve-prompt", async (req, res) => {
  const { description, mode, targetRepo } = req.body;
  if (!description?.trim())
    return res.status(400).json({ error: "description required" });
  if (!targetRepo?.trim())
    return res.status(400).json({ error: "targetRepo required" });

  // Load the agent soul from .claude/agents/prompt-enhancer.md (body = system prompt)
  const agentFile = await readFile(
    path.join(WORKSPACE, ".claude/agents/prompt-enhancer.md"),
    "utf8",
  );
  const systemPrompt = matter(agentFile).content.trim();

  const intent =
    mode === "investigate"
      ? "finding the root cause of a bug"
      : mode === "fix"
        ? "reporting a bug to be fixed in an existing completed task"
        : mode === "subtask"
          ? "describing a related feature or enhancement to add on top of an existing completed task"
          : "building or fixing a feature";

  const xmlHint =
    mode === "fix"
      ? "Use XML tags: <problem>, <context>, <reproduction_steps>, <expected_behavior>, <technical_details>"
      : mode === "subtask"
        ? "Use XML tags: <problem>, <context>, <requirements>, <integration_points>, <acceptance_criteria>"
        : mode === "investigate"
          ? "Use XML tags: <problem>, <context>, <reproduction_steps>, <expected_behavior>, <technical_details>"
          : "Use XML tags: <problem>, <context>, <requirements>, <technical_details>, <acceptance_criteria>";

  const userMessage = `The user wants a task for ${intent}. Their description:\n"""\n${description.trim()}\n"""\n\nTarget repository: ${targetRepo.trim()}\n\nRespond ONLY with valid JSON — no markdown, no preamble:\n{"action":"rewrite","result":"<problem>...</problem>\\n<context>...</context>\\n...","explanation":"one sentence"}\nor\n{"action":"ask","result":["question 1","question 2"],"explanation":"one sentence"}\n\nIMPORTANT: When action is "rewrite", the result MUST be structured with XML tags. ${xmlHint}. Only include tags that are relevant. Do not use plain prose — use the XML structure.`;

  // Stream NDJSON — each line is a JSON event
  res.setHeader("Content-Type", "application/x-ndjson");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("X-Accel-Buffering", "no"); // disable nginx buffering if proxied

  const send = (obj) => res.write(JSON.stringify(obj) + "\n");

  try {
    const proc = spawn(
      "claude",
      ["--system-prompt", systemPrompt, "-p", userMessage],
      {
        cwd: targetRepo.trim(),
        env: process.env,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    let fullOutput = "";

    proc.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      fullOutput += text;
      send({ chunk: text });
    });

    proc.on("close", (code) => {
      if (code !== 0) {
        send({ error: "Claude exited with error" });
        res.end();
        return;
      }
      const match = fullOutput.match(/\{[\s\S]*\}/);
      if (!match) {
        send({ error: "Could not parse response" });
        res.end();
        return;
      }
      try {
        send({ done: true, result: JSON.parse(match[0]) });
      } catch {
        send({ error: "Invalid JSON from Claude" });
      }
      res.end();
    });

    proc.on("error", (err) => {
      send({ error: err.message });
      res.end();
    });
  } catch (err) {
    send({ error: err.message });
    res.end();
  }
});

// ─── running workflows (global, survives WebSocket disconnect) ──────────────

// Key = taskPath, Value = { proc, output: string[], exitCode: number|null }
const runningWorkflows = new Map();

// Key = chatId, Value = { proc, assistantText, toolEvents }.
// Tracks the *currently running* proc for a chat so we can guard against
// duplicate sends and snapshot in-progress state for chat-resume.
const activeChatProcs = new Map();

// Key = chatId, Value = Set<ws>. Persistent across procs — a UI tab that
// chat-subscribed once stays in the set until the ws closes or it explicitly
// unsubscribes, so it receives events from *any* future spawn on that chat.
const chatSubscribers = new Map();

// Auto-compact threshold. When a turn's total context (prompt + cache + output)
// reaches this, the next user send transparently runs `/compact` first so the
// resumed session starts with a summarised history. Hard-coded 200k * 70%.
const AUTO_COMPACT_TOKENS = 140_000;

async function runCompactIfNeeded(chat, broadcast) {
  const tokens = chat.lastContextTokens || 0;
  if (tokens < AUTO_COMPACT_TOKENS || !chat.sessionId) return false;
  broadcast?.({
    type: "chat-tool",
    name: "Compact",
    input: { reason: `context ${tokens} tokens (>= ${AUTO_COMPACT_TOKENS})` },
  });
  return await new Promise((resolve) => {
    const args = [
      "-p",
      "/compact",
      "--output-format",
      "stream-json",
      "--verbose",
      "--dangerously-skip-permissions",
      "--resume",
      chat.sessionId,
    ];
    const proc = spawn("claude", args, {
      cwd: WORKSPACE,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let buf = "";
    let newSid = null;
    proc.stdout.on("data", (chunk) => {
      buf += chunk.toString();
      const lines = buf.split("\n");
      buf = lines.pop();
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const e = JSON.parse(line);
          if (e.session_id) newSid = e.session_id;
        } catch {}
      }
    });
    proc.on("close", () => {
      if (newSid && newSid !== chat.sessionId) chat.sessionId = newSid;
      // After compaction the next prompt starts fresh — reset the counter so
      // we don't loop-compact while the new session is still small.
      chat.lastContextTokens = 0;
      resolve(true);
    });
    proc.on("error", () => resolve(false));
  });
}

// Key = chatId, Value = Set<absolute file path>. Tracks files the agent has
// touched via Edit/Write/MultiEdit during this server's lifetime. The
// /api/chats/:id/file endpoint allows reading these even when they fall
// outside WORKSPACE/folderPaths — since the agent already wrote them,
// letting the operator *view* them is strictly less invasive.
const chatEditedPaths = new Map();
function rememberEditedPath(chatId, p) {
  if (!chatId || !p) return;
  if (!chatEditedPaths.has(chatId)) chatEditedPaths.set(chatId, new Set());
  chatEditedPaths.get(chatId).add(path.resolve(p));
}

function addChatSubscriber(chatId, ws) {
  if (!chatSubscribers.has(chatId)) chatSubscribers.set(chatId, new Set());
  chatSubscribers.get(chatId).add(ws);
}

function broadcastToChat(chatId, payload) {
  const subs = chatSubscribers.get(chatId);
  if (!subs || subs.size === 0) return;
  const data = JSON.stringify(payload);
  for (const ws of subs) {
    if (ws.readyState === 1) ws.send(data);
  }
}

// REST endpoint: check if a workflow is running or has buffered output
app.get("/api/workflows/:taskPath(*)", (req, res) => {
  const wf = runningWorkflows.get(req.params.taskPath);
  if (!wf) return res.json({ running: false });
  res.json({
    running: wf.exitCode === null,
    exitCode: wf.exitCode,
    output: wf.output,
  });
});

// REST stop — kills workflow regardless of WS subscription state
app.post("/api/workflows/:taskPath(*)/stop", (req, res) => {
  const taskPath = req.params.taskPath;
  const wf = runningWorkflows.get(taskPath);
  if (!wf || wf.exitCode !== null) {
    // also try queue cancel if it matches
    if (queueRunning && queueRunning.path === taskPath) {
      queueRunning.proc.kill("SIGTERM");
      return res.json({ ok: true });
    }
    return res.status(404).json({ error: "Not running" });
  }
  wf.proc.kill("SIGINT");
  wf.exitCode = -1;
  runningWorkflows.delete(taskPath);
  // notify any WS subscribers
  wss.clients.forEach((client) => {
    if (client.readyState === 1 && client.subscribedTask === taskPath) {
      client.send(JSON.stringify({ type: "stopped" }));
    }
  });
  res.json({ ok: true });
});

// Expose queue runner status
app.get("/api/queue/status", (req, res) => {
  res.json({
    running: queueRunning
      ? { type: queueRunning.type, path: queueRunning.path }
      : null,
  });
});

// ─── remote control API ─────────────────────────────────────────────────────

app.get("/api/remote/status", (req, res) => {
  res.json({
    active: remoteSession.active,
    paired: !!remoteSession.sessionId,
    pairedAt: remoteSession.pairedAt,
    tunnelUrl: remoteSession.tunnelUrl,
    // Include QR so it survives page refresh
    ...(remoteSession.active && !remoteSession.sessionId
      ? { qrDataUrl: remoteSession.qrDataUrl, url: remoteSession.pairUrl }
      : {}),
  });
});

app.post("/api/remote/enable", async (req, res) => {
  try {
    // Kill existing tunnel
    if (remoteSession.tunnelProc) {
      remoteSession.tunnelProc.kill();
      remoteSession.tunnelProc = null;
    }

    const token = crypto.randomUUID();

    // Start cloudflared quick tunnel
    const proc = spawn(
      CLOUDFLARED_BIN,
      ["tunnel", "--url", `http://localhost:${PORT}`],
      {
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    // Parse tunnel URL from stderr output
    const tunnelUrl = await new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("Tunnel creation timed out")),
        15000,
      );
      let stderr = "";
      proc.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
        const match = stderr.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
        if (match) {
          clearTimeout(timeout);
          resolve(match[0]);
        }
      });
      proc.on("exit", (code) => {
        clearTimeout(timeout);
        reject(new Error(`cloudflared exited with code ${code}`));
      });
    });

    const pairUrl = `${tunnelUrl}/?pair=${token}`;
    const qrDataUrl = await QRCode.toDataURL(pairUrl, {
      width: 280,
      margin: 2,
    });

    remoteSession = {
      active: true,
      token,
      sessionId: null,
      pairedAt: null,
      tunnelUrl,
      tunnelProc: proc,
      pairUrl,
      qrDataUrl,
    };

    proc.on("exit", () => {
      if (remoteSession.tunnelProc === proc) {
        remoteSession = {
          active: false,
          token: null,
          sessionId: null,
          pairedAt: null,
          tunnelUrl: null,
          tunnelProc: null,
          pairUrl: null,
          qrDataUrl: null,
        };
        console.log("[Remote] Tunnel closed");
      }
    });

    console.log(`[Remote] Tunnel open → ${tunnelUrl}`);
    res.json({ url: pairUrl, qrDataUrl, tunnelUrl });
  } catch (err) {
    if (remoteSession.tunnelProc) {
      remoteSession.tunnelProc.kill();
      remoteSession.tunnelProc = null;
    }
    res.status(500).json({ error: `Failed to create tunnel: ${err.message}` });
  }
});

app.post("/api/remote/disable", (req, res) => {
  if (remoteSession.tunnelProc) {
    remoteSession.tunnelProc.kill();
    remoteSession.tunnelProc = null;
  }
  remoteSession = {
    active: false,
    token: null,
    sessionId: null,
    pairedAt: null,
    tunnelUrl: null,
    tunnelProc: null,
  };
  res.json({ ok: true });
});

// ─── attachments ────────────────────────────────────────────────────────────
const attachmentsDir = () => path.join(WORKSPACE, "attachments");

async function ensureAttachmentsDir() {
  if (!existsSync(attachmentsDir()))
    await mkdir(attachmentsDir(), { recursive: true });
}

function sanitizeFilename(name) {
  return (name || "file").replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 80);
}

app.post("/api/uploads", async (req, res) => {
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

// ─── usage tracking ─────────────────────────────────────────────────────────
const usagePath = () => path.join(WORKSPACE, "usage.jsonl");

async function logUsage(entry) {
  const line =
    JSON.stringify({ at: new Date().toISOString(), ...entry }) + "\n";
  try {
    await appendFile(usagePath(), line);
  } catch (e) {
    console.warn("[usage] append failed:", e.message);
  }
}

function extractUsage(event) {
  if (!event || event.type !== "result") return null;
  const u = event.usage || {};
  return {
    cost_usd: event.total_cost_usd || 0,
    duration_ms: event.duration_ms || 0,
    duration_api_ms: event.duration_api_ms || 0,
    num_turns: event.num_turns || 0,
    tokens: {
      input: u.input_tokens || 0,
      output: u.output_tokens || 0,
      cache_read: u.cache_read_input_tokens || 0,
      cache_creation: u.cache_creation_input_tokens || 0,
    },
    is_error: !!event.is_error,
    session_id: event.session_id || null,
  };
}

async function readUsageEntries(limit = 1000) {
  try {
    const raw = await readFile(usagePath(), "utf8");
    const lines = raw.split("\n").filter(Boolean);
    const slice = lines.slice(-limit);
    return slice
      .map((l) => {
        try {
          return JSON.parse(l);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

app.get("/api/usage", async (req, res) => {
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

// ─── account ────────────────────────────────────────────────────────────────
app.get("/api/account", async (req, res) => {
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

// ─── chat ────────────────────────────────────────────────────────────────────
const chatsDir = () => path.join(WORKSPACE, "chats");
const chatPath = (id) => path.join(chatsDir(), `${id}.json`);

async function ensureChatsDir() {
  if (!existsSync(chatsDir())) await mkdir(chatsDir(), { recursive: true });
}

async function readChat(id) {
  try {
    return JSON.parse(await readFile(chatPath(id), "utf8"));
  } catch {
    return null;
  }
}

async function writeChat(chat) {
  await ensureChatsDir();
  await writeFile(chatPath(chat.id), JSON.stringify(chat, null, 2));
}

app.get("/api/chats", async (req, res) => {
  try {
    await ensureChatsDir();
    const files = await readdir(chatsDir());
    const wantKind = req.query.kind || "chat";
    const chats = await Promise.all(
      files
        .filter((f) => f.endsWith(".json"))
        .map(async (f) => {
          try {
            const c = JSON.parse(
              await readFile(path.join(chatsDir(), f), "utf8"),
            );
            const kind = c.kind || "chat";
            if (kind !== wantKind) return null;
            return {
              id: c.id,
              title: c.title,
              kind,
              agent: c.agent || null,
              createdAt: c.createdAt,
              updatedAt: c.updatedAt,
              messageCount: (c.messages || []).length,
            };
          } catch {
            return null;
          }
        }),
    );
    res.json(
      chats
        .filter(Boolean)
        .sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || "")),
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/chats", async (req, res) => {
  try {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const ALLOWED_KINDS = ["chat", "investigate", "trading"];
    const kind = ALLOWED_KINDS.includes(req.body?.kind)
      ? req.body.kind
      : "chat";
    const agent =
      typeof req.body?.agent === "string" && req.body.agent.trim()
        ? req.body.agent.trim()
        : null;
    const title =
      kind === "investigate"
        ? "New investigation"
        : kind === "trading"
          ? "New analysis"
          : "New chat";
    const chat = {
      id,
      title,
      kind,
      agent,
      sessionId: null,
      model: "sonnet",
      folderPaths: [WORKSPACE],
      createdAt: now,
      updatedAt: now,
      messages: [],
    };
    await writeChat(chat);
    res.json(chat);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/chats/:id", async (req, res) => {
  const chat = await readChat(req.params.id);
  if (!chat) return res.status(404).json({ error: "Not found" });
  res.json(chat);
});

// Read a file for the live-edit panel. Restricted to WORKSPACE + the chat's
// declared folderPaths (which are the same dirs claude is allowed to touch
// via --add-dir), so a malicious chatId can't pull arbitrary files.
app.get("/api/chats/:id/file", async (req, res) => {
  const chat = await readChat(req.params.id);
  if (!chat) return res.status(404).json({ error: "Chat not found" });
  const filePath = req.query.path;
  if (typeof filePath !== "string" || !filePath) {
    return res.status(400).json({ error: "path required" });
  }
  const resolved = path.resolve(filePath);
  const allowedRoots = [WORKSPACE, ...(chat.folderPaths || [])]
    .filter(Boolean)
    .map((p) => path.resolve(p));
  const inAllowedRoot = allowedRoots.some(
    (root) => resolved === root || resolved.startsWith(root + path.sep),
  );
  // Also allow viewing any file the agent has touched in this chat, even if
  // it's outside the declared roots — the agent already wrote it on this
  // host, so reading it back to the operator is safe.
  const wasEdited = chatEditedPaths.get(req.params.id)?.has(resolved);
  if (!inAllowedRoot && !wasEdited) {
    return res.status(403).json({ error: "Path outside allowed roots" });
  }
  if (!existsSync(resolved)) {
    return res.status(404).json({ error: "File not found" });
  }
  try {
    const st = await stat(resolved);
    if (st.size > 1024 * 1024) {
      return res
        .status(413)
        .json({ error: "File too large (>1MB)", size: st.size });
    }
    const content = await readFile(resolved, "utf8");
    res.json({ path: resolved, content, size: st.size, mtime: st.mtimeMs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch("/api/chats/:id", async (req, res) => {
  const chat = await readChat(req.params.id);
  if (!chat) return res.status(404).json({ error: "Not found" });
  if (typeof req.body.title === "string")
    chat.title = req.body.title.trim().slice(0, 200) || chat.title;
  if (
    typeof req.body.model === "string" &&
    ["sonnet", "opus", "haiku"].includes(req.body.model)
  )
    chat.model = req.body.model;
  if (Array.isArray(req.body.folderPaths)) {
    chat.folderPaths = req.body.folderPaths
      .filter((p) => typeof p === "string" && p.trim())
      .slice(0, 10);
  }
  if (
    typeof req.body.effort === "string" &&
    ["low", "medium", "high", "xhigh", "max", ""].includes(req.body.effort)
  ) {
    chat.effort = req.body.effort || null;
  }
  if (typeof req.body.planMode === "boolean") {
    chat.planMode = req.body.planMode;
  }
  chat.updatedAt = new Date().toISOString();
  await writeChat(chat);
  res.json(chat);
});

app.delete("/api/chats/:id", async (req, res) => {
  try {
    if (existsSync(chatPath(req.params.id))) await rm(chatPath(req.params.id));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Catch-all for React SPA (production)
app.get("*", (req, res) => {
  const indexPath = path.join(__dirname, "dist/index.html");
  if (existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).send('Run "npm run build" first, or use "npm run dev".');
  }
});

// ─── websocket ───────────────────────────────────────────────────────────────

wss.on("connection", (ws, req) => {
  // Remote access gate for WebSocket (cookie-based)
  const clientIp = req.socket.remoteAddress;
  const isLocal = ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(clientIp);
  if (!isLocal) {
    const cookies = parseCookies(req.headers.cookie);
    if (
      !remoteSession.active ||
      !cookies.remote_sid ||
      cookies.remote_sid !== remoteSession.sessionId
    ) {
      ws.close(4003, "Not authorized");
      return;
    }
  }

  const safeSend = (data) => {
    if (ws.readyState === 1) ws.send(JSON.stringify(data));
  };

  // Store on ws object so queue cron broadcast can find subscribers
  ws.subscribedTask = null;

  ws.on("message", async (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    if (msg.action === "run-workflow") {
      const { taskPath } = msg;

      // If already running, subscribe to it
      const existing = runningWorkflows.get(taskPath);
      if (existing && existing.exitCode === null) {
        ws.subscribedTask = taskPath;
        // Replay buffered output
        safeSend({ type: "started", taskPath });
        for (const line of existing.output) {
          safeSend({ type: line.isErr ? "stderr" : "stdout", data: line.text });
        }
        return;
      }

      // Read target path from task to add as allowed directory
      const targetInfoPath = path.join(WORKSPACE, taskPath, "target-info.md");
      let targetDir = null;
      if (existsSync(targetInfoPath)) {
        const info = await readFile(targetInfoPath, "utf8");
        const m = info.match(/\*\*Path:\*\*\s*(.+)/);
        if (m) targetDir = m[1].trim();
      }

      // Start new workflow with streaming output + full permissions for automated pipeline
      const args = [
        "-p",
        `/workflow ${taskPath}`,
        "--output-format",
        "stream-json",
        "--verbose",
        "--dangerously-skip-permissions",
      ];
      if (targetDir) args.push("--add-dir", targetDir);

      // Auto-pass per-project MCP config if it exists
      const projectName = taskPath.split("/")[1]; // tasks/{project}/{taskId}
      const projMcpFile = path.join(
        WORKSPACE,
        "projects",
        projectName,
        "mcp.json",
      );
      if (existsSync(projMcpFile)) args.push("--mcp-config", projMcpFile);

      const proc = spawn("claude", args, {
        cwd: WORKSPACE,
        env: process.env,
        stdio: ["ignore", "pipe", "pipe"],
      });

      const wf = { proc, output: [], exitCode: null };
      runningWorkflows.set(taskPath, wf);
      ws.subscribedTask = taskPath;

      safeSend({ type: "started", taskPath });

      // Parse stream-json: each line is a JSON object with type/content
      let stdoutBuf = "";
      let lastResultEvent = null;
      proc.stdout.on("data", (chunk) => {
        stdoutBuf += chunk.toString();
        const lines = stdoutBuf.split("\n");
        stdoutBuf = lines.pop(); // keep incomplete line
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const event = JSON.parse(line);
            let text = "";
            if (event.type === "assistant" && event.message?.content) {
              for (const block of event.message.content) {
                if (block.type === "text") text += block.text;
                else if (block.type === "tool_use") {
                  const name = block.name;
                  const input = block.input || {};
                  if (name === "Agent") {
                    text += `\n⚡ [Agent: ${input.description || "subagent"}] ${input.subagent_type || ""} (${input.model || "default"})\n`;
                  } else {
                    text += `\n[${name}] ${JSON.stringify(input).slice(0, 200)}\n`;
                  }
                }
              }
            } else if (event.type === "tool_result") {
              // Subagent results — show a summary
              const content = event.content || "";
              const summary =
                typeof content === "string" ? content : JSON.stringify(content);
              if (summary.length > 0) {
                // Only show first 500 chars of agent results to keep terminal readable
                text = `\n✓ [Result] ${summary.slice(0, 500)}${summary.length > 500 ? "..." : ""}\n`;
              }
            } else if (event.type === "result" && event.result) {
              text =
                typeof event.result === "string"
                  ? event.result
                  : JSON.stringify(event.result);
              lastResultEvent = event;
            } else if (event.type === "result") {
              lastResultEvent = event;
            }
            if (text) {
              wf.output.push({ text, isErr: false });
              if (wf.output.length > 500)
                wf.output.splice(0, wf.output.length - 500);
              safeSend({ type: "stdout", data: text });
            }
          } catch {
            // Not JSON — send as raw text
            wf.output.push({ text: line, isErr: false });
            if (wf.output.length > 500)
              wf.output.splice(0, wf.output.length - 500);
            safeSend({ type: "stdout", data: line });
          }
        }
      });
      proc.stderr.on("data", (chunk) => {
        const text = chunk.toString();
        wf.output.push({ text, isErr: true });
        if (wf.output.length > 500) wf.output.splice(0, wf.output.length - 500);
        safeSend({ type: "stderr", data: text });
      });
      proc.on("close", (code) => {
        wf.exitCode = code;
        safeSend({ type: "done", code });
        if (lastResultEvent)
          logUsage({
            kind: "workflow",
            ref: taskPath,
            ...extractUsage(lastResultEvent),
          });
        // Clean up after 5 minutes (keep output for reconnect)
        setTimeout(() => runningWorkflows.delete(taskPath), 5 * 60 * 1000);
      });
      proc.on("error", (err) => {
        wf.exitCode = 1;
        safeSend({ type: "error", message: err.message });
      });
    }

    if (msg.action === "run-fix") {
      // Bug fix run: /fix-bugs [taskPath] [fixPath]
      const { taskPath, fixPath } = msg; // taskPath = original task, fixPath = fixes/fixId

      const existing = runningWorkflows.get(fixPath);
      if (existing && existing.exitCode === null) {
        ws.subscribedTask = fixPath;
        safeSend({ type: "started", taskPath: fixPath });
        for (const line of existing.output) {
          safeSend({ type: line.isErr ? "stderr" : "stdout", data: line.text });
        }
        return;
      }

      // Track in queue so status persists across reloads
      try {
        const q = await readQueue();
        const existingQ = q.tasks.find(
          (t) => t.type === "fix" && t.fix_path === fixPath,
        );
        if (existingQ) {
          existingQ.status = "running";
          existingQ.error = null;
        } else
          q.tasks.push({
            description: fixPath.split("/").pop(),
            target: null,
            status: "running",
            type: "fix",
            task_id: null,
            project: null,
            task_path: taskPath,
            fix_path: fixPath,
            subtask_path: null,
            added_at: new Date().toISOString(),
            finished_at: null,
            error: null,
          });
        await writeQueue(q);
      } catch {}

      // Read target repo from original task
      const targetInfoPath = path.join(WORKSPACE, taskPath, "target-info.md");
      let targetDir = null;
      if (existsSync(targetInfoPath)) {
        const info = await readFile(targetInfoPath, "utf8");
        const m = info.match(/\*\*Path:\*\*\s*(.+)/);
        if (m) targetDir = m[1].trim();
      }

      const args = [
        "-p",
        `/fix-bugs ${taskPath} ${fixPath}`,
        "--output-format",
        "stream-json",
        "--verbose",
        "--dangerously-skip-permissions",
      ];
      if (targetDir) args.push("--add-dir", targetDir);

      const projectName = taskPath.split("/")[1];
      const projMcpFile = path.join(
        WORKSPACE,
        "projects",
        projectName,
        "mcp.json",
      );
      if (existsSync(projMcpFile)) args.push("--mcp-config", projMcpFile);

      const proc = spawn("claude", args, {
        cwd: WORKSPACE,
        env: process.env,
        stdio: ["ignore", "pipe", "pipe"],
      });

      const wf = { proc, output: [], exitCode: null };
      runningWorkflows.set(fixPath, wf);
      ws.subscribedTask = fixPath;

      safeSend({ type: "started", taskPath: fixPath });

      let stdoutBuf = "";
      let lastResultEvent = null;
      proc.stdout.on("data", (chunk) => {
        stdoutBuf += chunk.toString();
        const lines = stdoutBuf.split("\n");
        stdoutBuf = lines.pop();
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const event = JSON.parse(line);
            let text = "";
            if (event.type === "assistant" && event.message?.content) {
              for (const block of event.message.content) {
                if (block.type === "text") text += block.text;
                else if (block.type === "tool_use") {
                  const name = block.name;
                  const input = block.input || {};
                  if (name === "Agent") {
                    text += `\n⚡ [Agent: ${input.description || "subagent"}] ${input.subagent_type || ""}\n`;
                  } else {
                    text += `\n[${name}] ${JSON.stringify(input).slice(0, 200)}\n`;
                  }
                }
              }
            } else if (event.type === "tool_result") {
              const content = event.content || "";
              const summary =
                typeof content === "string" ? content : JSON.stringify(content);
              if (summary.length > 0)
                text = `\n✓ [Result] ${summary.slice(0, 500)}${summary.length > 500 ? "..." : ""}\n`;
            } else if (event.type === "result" && event.result) {
              text =
                typeof event.result === "string"
                  ? event.result
                  : JSON.stringify(event.result);
              lastResultEvent = event;
            } else if (event.type === "result") {
              lastResultEvent = event;
            }
            if (text) {
              wf.output.push({ text, isErr: false });
              if (wf.output.length > 500)
                wf.output.splice(0, wf.output.length - 500);
              safeSend({ type: "stdout", data: text });
            }
          } catch {
            wf.output.push({ text: line, isErr: false });
            if (wf.output.length > 500)
              wf.output.splice(0, wf.output.length - 500);
            safeSend({ type: "stdout", data: line });
          }
        }
      });
      proc.stderr.on("data", (chunk) => {
        const text = chunk.toString();
        wf.output.push({ text, isErr: true });
        if (wf.output.length > 500) wf.output.splice(0, wf.output.length - 500);
        safeSend({ type: "stderr", data: text });
      });
      proc.on("close", async (code) => {
        wf.exitCode = code;
        safeSend({ type: "done", code });
        if (lastResultEvent)
          logUsage({
            kind: "fix",
            ref: fixPath,
            ...extractUsage(lastResultEvent),
          });
        setTimeout(() => runningWorkflows.delete(fixPath), 5 * 60 * 1000);
        try {
          const q = await readQueue();
          const qi = q.tasks.find(
            (t) => t.type === "fix" && t.fix_path === fixPath,
          );
          if (qi) {
            qi.status = code === 0 ? "done" : "failed";
            qi.finished_at = new Date().toISOString();
            if (code !== 0) qi.error = `Exit code ${code}`;
          }
          await writeQueue(q);
        } catch {}
      });
      proc.on("error", async (err) => {
        wf.exitCode = 1;
        safeSend({ type: "error", message: err.message });
        try {
          const q = await readQueue();
          const qi = q.tasks.find(
            (t) => t.type === "fix" && t.fix_path === fixPath,
          );
          if (qi) {
            qi.status = "failed";
            qi.finished_at = new Date().toISOString();
            qi.error = err.message;
          }
          await writeQueue(q);
        } catch {}
      });
    }

    if (msg.action === "run-subtask") {
      const { taskPath, subtaskPath } = msg;

      const existing = runningWorkflows.get(subtaskPath);
      if (existing && existing.exitCode === null) {
        ws.subscribedTask = subtaskPath;
        safeSend({ type: "started", taskPath: subtaskPath });
        for (const line of existing.output) {
          safeSend({ type: line.isErr ? "stderr" : "stdout", data: line.text });
        }
        return;
      }

      // Track in queue so status persists across reloads
      try {
        const q = await readQueue();
        const existingQ = q.tasks.find(
          (t) => t.type === "subtask" && t.subtask_path === subtaskPath,
        );
        if (existingQ) {
          existingQ.status = "running";
          existingQ.error = null;
        } else
          q.tasks.push({
            description: subtaskPath.split("/").pop(),
            target: null,
            status: "running",
            type: "subtask",
            task_id: null,
            project: null,
            task_path: taskPath,
            fix_path: null,
            subtask_path: subtaskPath,
            added_at: new Date().toISOString(),
            finished_at: null,
            error: null,
          });
        await writeQueue(q);
      } catch {}

      const targetInfoPath = path.join(WORKSPACE, taskPath, "target-info.md");
      let targetDir = null;
      if (existsSync(targetInfoPath)) {
        const info = await readFile(targetInfoPath, "utf8");
        const m = info.match(/\*\*Path:\*\*\s*(.+)/);
        if (m) targetDir = m[1].trim();
      }

      const args = [
        "-p",
        `/sub-task ${taskPath} ${subtaskPath}`,
        "--output-format",
        "stream-json",
        "--verbose",
        "--dangerously-skip-permissions",
      ];
      if (targetDir) args.push("--add-dir", targetDir);

      const projectName = taskPath.split("/")[1];
      const projMcpFile = path.join(
        WORKSPACE,
        "projects",
        projectName,
        "mcp.json",
      );
      if (existsSync(projMcpFile)) args.push("--mcp-config", projMcpFile);

      const proc = spawn("claude", args, {
        cwd: WORKSPACE,
        env: process.env,
        stdio: ["ignore", "pipe", "pipe"],
      });

      const wf = { proc, output: [], exitCode: null };
      runningWorkflows.set(subtaskPath, wf);
      ws.subscribedTask = subtaskPath;

      safeSend({ type: "started", taskPath: subtaskPath });

      let stdoutBuf = "";
      let lastResultEvent = null;
      proc.stdout.on("data", (chunk) => {
        stdoutBuf += chunk.toString();
        const lines = stdoutBuf.split("\n");
        stdoutBuf = lines.pop();
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const event = JSON.parse(line);
            let text = "";
            if (event.type === "assistant" && event.message?.content) {
              for (const block of event.message.content) {
                if (block.type === "text") text += block.text;
                else if (block.type === "tool_use") {
                  const name = block.name;
                  const input = block.input || {};
                  if (name === "Agent")
                    text += `\n⚡ [Agent: ${input.description || "subagent"}] ${input.subagent_type || ""}\n`;
                  else
                    text += `\n[${name}] ${JSON.stringify(input).slice(0, 200)}\n`;
                }
              }
            } else if (event.type === "tool_result") {
              const content = event.content || "";
              const summary =
                typeof content === "string" ? content : JSON.stringify(content);
              if (summary.length > 0)
                text = `\n✓ [Result] ${summary.slice(0, 500)}${summary.length > 500 ? "..." : ""}\n`;
            } else if (event.type === "result" && event.result) {
              text =
                typeof event.result === "string"
                  ? event.result
                  : JSON.stringify(event.result);
              lastResultEvent = event;
            } else if (event.type === "result") {
              lastResultEvent = event;
            }
            if (text) {
              wf.output.push({ text, isErr: false });
              if (wf.output.length > 500)
                wf.output.splice(0, wf.output.length - 500);
              safeSend({ type: "stdout", data: text });
            }
          } catch {
            wf.output.push({ text: line, isErr: false });
            if (wf.output.length > 500)
              wf.output.splice(0, wf.output.length - 500);
            safeSend({ type: "stdout", data: line });
          }
        }
      });
      proc.stderr.on("data", (chunk) => {
        const text = chunk.toString();
        wf.output.push({ text, isErr: true });
        if (wf.output.length > 500) wf.output.splice(0, wf.output.length - 500);
        safeSend({ type: "stderr", data: text });
      });
      proc.on("close", async (code) => {
        wf.exitCode = code;
        safeSend({ type: "done", code });
        if (lastResultEvent)
          logUsage({
            kind: "subtask",
            ref: subtaskPath,
            ...extractUsage(lastResultEvent),
          });
        setTimeout(() => runningWorkflows.delete(subtaskPath), 5 * 60 * 1000);
        try {
          const q = await readQueue();
          const qi = q.tasks.find(
            (t) => t.type === "subtask" && t.subtask_path === subtaskPath,
          );
          if (qi) {
            qi.status = code === 0 ? "done" : "failed";
            qi.finished_at = new Date().toISOString();
            if (code !== 0) qi.error = `Exit code ${code}`;
          }
          await writeQueue(q);
        } catch {}
      });
      proc.on("error", async (err) => {
        wf.exitCode = 1;
        safeSend({ type: "error", message: err.message });
        try {
          const q = await readQueue();
          const qi = q.tasks.find(
            (t) => t.type === "subtask" && t.subtask_path === subtaskPath,
          );
          if (qi) {
            qi.status = "failed";
            qi.finished_at = new Date().toISOString();
            qi.error = err.message;
          }
          await writeQueue(q);
        } catch {}
      });
    }

    if (msg.action === "subscribe") {
      // Re-subscribe to an existing workflow (e.g. after navigating back)
      const { taskPath } = msg;
      const wf = runningWorkflows.get(taskPath);
      if (!wf) {
        safeSend({ type: "not-found" });
        return;
      }
      ws.subscribedTask = taskPath;
      safeSend({ type: "started", taskPath });
      for (const line of wf.output) {
        safeSend({ type: line.isErr ? "stderr" : "stdout", data: line.text });
      }
      if (wf.exitCode !== null) {
        safeSend({ type: "done", code: wf.exitCode });
      }
    }

    if (msg.action === "run-command") {
      const { command } = msg;
      safeSend({ type: "started", command });

      const proc = spawn(
        "claude",
        [
          "-p",
          command,
          "--output-format",
          "stream-json",
          "--verbose",
          "--dangerously-skip-permissions",
        ],
        { cwd: WORKSPACE, env: process.env, stdio: ["ignore", "pipe", "pipe"] },
      );

      let cmdBuf = "";
      let lastResultEvent = null;
      proc.stdout.on("data", (chunk) => {
        cmdBuf += chunk.toString();
        const lines = cmdBuf.split("\n");
        cmdBuf = lines.pop();
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const event = JSON.parse(line);
            let text = "";
            if (event.type === "assistant" && event.message?.content) {
              for (const block of event.message.content) {
                if (block.type === "text") text += block.text;
                else if (block.type === "tool_use") {
                  const name = block.name;
                  const input = block.input || {};
                  if (name === "Agent") {
                    text += `\n⚡ [Agent: ${input.description || "subagent"}] ${input.subagent_type || ""} (${input.model || "default"})\n`;
                  } else {
                    text += `\n[${name}] ${JSON.stringify(input).slice(0, 200)}\n`;
                  }
                }
              }
            } else if (event.type === "tool_result") {
              const content = event.content || "";
              const summary =
                typeof content === "string" ? content : JSON.stringify(content);
              if (summary.length > 0) {
                text = `\n✓ [Result] ${summary.slice(0, 500)}${summary.length > 500 ? "..." : ""}\n`;
              }
            } else if (event.type === "result" && event.result) {
              text =
                typeof event.result === "string"
                  ? event.result
                  : JSON.stringify(event.result);
              lastResultEvent = event;
            } else if (event.type === "result") {
              lastResultEvent = event;
            }
            if (text) safeSend({ type: "stdout", data: text });
          } catch {
            safeSend({ type: "stdout", data: line });
          }
        }
      });
      proc.stderr.on("data", (chunk) => {
        safeSend({ type: "stderr", data: chunk.toString() });
      });
      proc.on("close", (code) => {
        safeSend({ type: "done", code });
        if (lastResultEvent)
          logUsage({
            kind: "command",
            ref: command?.slice(0, 200),
            ...extractUsage(lastResultEvent),
          });
      });
      proc.on("error", (err) => {
        safeSend({ type: "error", message: err.message });
      });
    }

    if (msg.action === "stop") {
      if (ws.subscribedTask) {
        const wf = runningWorkflows.get(ws.subscribedTask);
        if (wf && wf.exitCode === null) {
          wf.proc.kill("SIGINT");
          wf.exitCode = -1;
          safeSend({ type: "stopped" });
          runningWorkflows.delete(ws.subscribedTask);
        }
      }
    }

    if (msg.action === "chat-send") {
      const { chatId, message, attachments } = msg;
      if (!chatId || !message?.trim()) {
        safeSend({ type: "chat-error", error: "chatId and message required" });
        return;
      }

      const chat = await readChat(chatId);
      if (!chat) {
        safeSend({ type: "chat-error", error: "Chat not found" });
        return;
      }

      // Auto-compact if last turn pushed context >= 70% of 200k. This blocks
      // the user send briefly while the compact subprocess runs and gives us
      // back a new sessionId for the summarised history. Status is sent via
      // safeSend (not broadcast) because the sender ws isn't a subscriber yet.
      const compacted = await runCompactIfNeeded(chat, (evt) => {
        safeSend(evt);
        broadcastToChat(chatId, evt);
      });
      if (compacted) await writeChat(chat);

      // Refuse a second send while the chat already has a running proc.
      // Two `claude --resume` on the same session jsonl race each other.
      if (activeChatProcs.has(chatId)) {
        safeSend({
          type: "chat-error",
          error:
            "This chat is already running. Wait for the current turn to finish (or press Stop) before sending again.",
        });
        return;
      }

      // Build the prompt: append attachment paths inline so Claude can read them
      const attachmentList = Array.isArray(attachments)
        ? attachments.filter((a) => a?.path && existsSync(a.path)).slice(0, 10)
        : [];

      // If the user attached folder pills other than the workspace, surface them
      // explicitly so the agent treats them as the primary working context.
      // Without this, --add-dir grants access but the agent's cwd is still
      // WORKSPACE and "this repo" defaults to agent-coding instead of the
      // mentioned folder.
      const userFolders = (chat.folderPaths || []).filter(
        (p) => p && p !== WORKSPACE && existsSync(p),
      );
      const folderContext =
        userFolders.length > 0
          ? `[Working folder${userFolders.length > 1 ? "s" : ""}: ${userFolders.join(", ")}]\n` +
            `When the user says "this repo", "the project", "the codebase", or refers ` +
            `without a path, treat the folder${userFolders.length > 1 ? "s" : ""} above as the primary target. ` +
            `(${WORKSPACE} is just where the agent tooling lives.)\n\n`
          : "";

      const attachmentBlock =
        attachmentList.length > 0
          ? `\n\nAttached files:\n${attachmentList.map((a) => `- ${a.path}${a.filename ? ` (${a.filename})` : ""}`).join("\n")}`
          : "";

      const promptForClaude = folderContext + message + attachmentBlock;

      // Persist user message immediately (with attachment metadata)
      const now = new Date().toISOString();
      chat.messages.push({
        role: "user",
        content: message,
        timestamp: now,
        ...(attachmentList.length > 0
          ? {
              attachments: attachmentList.map((a) => ({
                path: a.path,
                filename: a.filename,
                contentType: a.contentType,
                size: a.size,
              })),
            }
          : {}),
      });
      chat.updatedAt = now;
      if (
        chat.messages.length === 1 ||
        !chat.title ||
        chat.title === "New chat"
      ) {
        chat.title =
          message.split("\n")[0].slice(0, 80) ||
          (attachmentList[0]?.filename ?? "New chat");
      }
      await writeChat(chat);
      safeSend({ type: "chat-user-saved", chat });

      const args = [
        "-p",
        promptForClaude,
        "--output-format",
        "stream-json",
        "--verbose",
        "--include-partial-messages",
        "--dangerously-skip-permissions",
      ];
      if (chat.sessionId) {
        args.push("--resume", chat.sessionId);
      } else {
        chat.sessionId = crypto.randomUUID();
        args.push("--session-id", chat.sessionId);
      }

      if (chat.model && ["sonnet", "opus", "haiku"].includes(chat.model)) {
        args.push("--model", chat.model);
      }

      // Investigations and other dedicated-agent chats route every turn through
      // the chosen sub-agent so the conversation stays focused on its persona.
      let agentEffort = null;
      if (chat.agent && /^[\w-]+$/.test(chat.agent)) {
        args.push("--agent", chat.agent);
        // Pull `effort` from the agent's frontmatter if defined.
        try {
          const agentFile = path.join(agentsDir(), `${chat.agent}.md`);
          if (existsSync(agentFile)) {
            const raw = await readFile(agentFile, "utf8");
            const fm = matter(raw).data || {};
            if (fm.effort) agentEffort = fm.effort;
          }
        } catch {}
      }

      // Per-chat override > agent default. Valid values: low|medium|high|xhigh|max
      const VALID_EFFORTS = ["low", "medium", "high", "xhigh", "max"];
      const effortToUse =
        chat.effort && VALID_EFFORTS.includes(chat.effort)
          ? chat.effort
          : agentEffort;
      if (effortToUse && VALID_EFFORTS.includes(effortToUse)) {
        args.push("--effort", effortToUse);
      }

      // Plan mode — agent proposes a plan and waits for approval before executing.
      if (chat.planMode) {
        args.push("--permission-mode", "plan");
      }

      // Enable the Claude-in-Chrome integration so /chat subprocesses can use
      // mcp__claude-in-chrome__* browser tools (open tabs, click, screenshot,
      // read DOM, etc.). Without --chrome the subprocess has no browser MCP.
      args.push("--chrome");

      // Folder mentions: keep cwd=WORKSPACE so --resume keeps finding the session,
      // expose mentioned folders via --add-dir so Claude can read/write inside them.
      const folderPaths = (chat.folderPaths || []).filter(
        (p) => p && p !== WORKSPACE && existsSync(p),
      );
      for (const extra of folderPaths) args.push("--add-dir", extra);

      const proc = spawn("claude", args, {
        cwd: WORKSPACE,
        env: process.env,
        stdio: ["ignore", "pipe", "pipe"],
      });
      ws.activeChatProc = proc;
      ws.activeChatId = chatId;
      const state = {
        proc,
        assistantText: "",
        toolEvents: [],
      };
      activeChatProcs.set(chatId, state);
      // The sender becomes a subscriber automatically so they get streaming
      // events back. Other tabs viewing the same chat must explicitly
      // chat-subscribe (Chat.jsx does this on selectChat).
      ws.subscribedChatIds = ws.subscribedChatIds || new Set();
      ws.subscribedChatIds.add(chatId);
      addChatSubscriber(chatId, ws);

      let assistantText = "";
      let stdoutBuf = "";
      let lastResultEvent = null;
      proc.stdout.on("data", (chunk) => {
        stdoutBuf += chunk.toString();
        const lines = stdoutBuf.split("\n");
        stdoutBuf = lines.pop();
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const event = JSON.parse(line);
            if (
              event.session_id &&
              (event.type === "system" || event.type === "assistant")
            ) {
              chat.sessionId = event.session_id;
            }
            if (event.type === "result") lastResultEvent = event;

            // Real-time character-level streaming from --include-partial-messages.
            // Each `stream_event` carries an Anthropic SSE-style sub-event; the
            // text_delta variant is what we want to forward to the UI.
            if (event.type === "stream_event") {
              const sub = event.event;
              if (
                sub?.type === "content_block_delta" &&
                sub.delta?.type === "text_delta" &&
                sub.delta.text
              ) {
                state.assistantText += sub.delta.text;
                broadcastToChat(chatId, {
                  type: "chat-delta",
                  text: sub.delta.text,
                });
              }
              continue;
            }

            // Final per-turn assistant event: capture full text for persistence
            // and surface tool_use blocks. Do NOT re-emit chat-delta here — the
            // partial stream_events already streamed every character.
            if (event.type === "assistant" && event.message?.content) {
              for (const block of event.message.content) {
                if (block.type === "text" && block.text) {
                  assistantText += block.text;
                } else if (block.type === "tool_use") {
                  const tool = {
                    name: block.name,
                    input: block.input || {},
                  };
                  state.toolEvents.push(tool);
                  if (
                    ["Edit", "Write", "MultiEdit"].includes(block.name) &&
                    tool.input.file_path
                  ) {
                    rememberEditedPath(chatId, tool.input.file_path);
                  }
                  broadcastToChat(chatId, { type: "chat-tool", ...tool });
                }
              }
            }
          } catch {
            // not JSON, ignore
          }
        }
      });

      proc.stderr.on("data", (chunk) => {
        broadcastToChat(chatId, {
          type: "chat-stderr",
          data: chunk.toString(),
        });
      });

      proc.on("close", async (code) => {
        if (assistantText) {
          chat.messages.push({
            role: "assistant",
            content: assistantText,
            timestamp: new Date().toISOString(),
          });
        }
        chat.updatedAt = new Date().toISOString();
        // Track approx context size so we can auto-compact at 70%.
        // Total = prompt + completion (the assistant output joins next turn's
        // prompt). Cache reads/creation count as part of the prompt.
        if (lastResultEvent?.usage) {
          const u = lastResultEvent.usage;
          chat.lastContextTokens =
            (u.input_tokens || 0) +
            (u.cache_read_input_tokens || 0) +
            (u.cache_creation_input_tokens || 0) +
            (u.output_tokens || 0);
        }
        await writeChat(chat);
        broadcastToChat(chatId, { type: "chat-done", code, chat });
        if (lastResultEvent) {
          logUsage({
            kind: chat.kind || "chat",
            ref: chat.id,
            model: chat.model || null,
            agent: chat.agent || null,
            ...extractUsage(lastResultEvent),
          });
        }
        if (ws.activeChatProc === proc) {
          ws.activeChatProc = null;
          ws.activeChatId = null;
        }
        // The map value is the state object, not the proc — compare via .proc
        if (activeChatProcs.get(chatId)?.proc === proc) {
          activeChatProcs.delete(chatId);
        }
      });
    }

    if (msg.action === "chat-subscribe") {
      const { chatId } = msg;
      if (!chatId) return;
      ws.subscribedChatIds = ws.subscribedChatIds || new Set();
      ws.subscribedChatIds.add(chatId);
      addChatSubscriber(chatId, ws);
      // Snapshot is taken synchronously — node is single-threaded so no new
      // delta can fire between this and the send. After this, the ws is in
      // the subscriber set and will receive every new chat-delta/chat-tool.
      const state = activeChatProcs.get(chatId);
      if (state) {
        safeSend({
          type: "chat-resume",
          chatId,
          assistantText: state.assistantText,
          toolEvents: state.toolEvents,
        });
      } else {
        safeSend({ type: "chat-not-running", chatId });
      }
    }

    if (msg.action === "chat-unsubscribe") {
      const { chatId } = msg;
      if (!chatId) return;
      const subs = chatSubscribers.get(chatId);
      if (subs) {
        subs.delete(ws);
        if (subs.size === 0) chatSubscribers.delete(chatId);
      }
      ws.subscribedChatIds?.delete(chatId);
    }

    if (msg.action === "chat-stop") {
      // Look up the proc by chatId from the global map — `ws.activeChatProc`
      // is only set on the ws that originally spawned, so a reloaded tab
      // (subscriber but not spawner) wouldn't have it. The Stop button must
      // work for any subscriber.
      const chatId = msg.chatId || ws.activeChatId;
      const state = chatId ? activeChatProcs.get(chatId) : null;
      const proc = state?.proc || ws.activeChatProc;
      if (proc) {
        proc.kill("SIGINT");
        if (chatId) {
          broadcastToChat(chatId, { type: "chat-stopped" });
        } else {
          safeSend({ type: "chat-stopped" });
        }
      }
    }
  });

  // WebSocket close: do NOT kill the process — let it run in background.
  // proc.on("close") still writes the full assistant message to disk, so the
  // user sees the complete reply when they reload the chat. Other still-open
  // subscribers (other tabs) keep receiving live deltas.
  ws.on("close", () => {
    ws.subscribedTask = null;
    if (ws.subscribedChatIds) {
      for (const chatId of ws.subscribedChatIds) {
        const subs = chatSubscribers.get(chatId);
        if (subs) {
          subs.delete(ws);
          if (subs.size === 0) chatSubscribers.delete(chatId);
        }
      }
      ws.subscribedChatIds.clear();
    }
    ws.activeChatProc = null;
    ws.activeChatId = null;
  });
});

// ─── Queue cron: polls every 5s, runs one item at a time ─────────────────────

let queueRunning = null; // { type, path, proc } — the currently executing queue item

async function getTargetDir(taskPath) {
  const targetInfoPath = path.join(WORKSPACE, taskPath, "target-info.md");
  if (!existsSync(targetInfoPath)) return null;
  const info = await readFile(targetInfoPath, "utf8");
  const m = info.match(/\*\*Path:\*\*\s*(.+)/);
  return m ? m[1].trim() : null;
}

async function queueTick() {
  // Skip if something is already running
  if (queueRunning) return;

  const q = await readQueue();

  // Fix orphan "running" items — status=running but no actual process (e.g. after server restart)
  let fixed = false;
  for (const t of q.tasks) {
    if (t.status === "running") {
      const trackPath =
        t.fix_path ||
        t.subtask_path ||
        t.task_path ||
        `tasks/${t.project}/${t.task_id}`;
      const wf = runningWorkflows.get(trackPath);
      if (!wf || wf.exitCode !== null) {
        console.log(
          `[Queue] Recovering orphan: ${t.description?.slice(0, 50)}`,
        );
        t.status = "pending"; // re-queue so it runs again
        t.error = null;
        fixed = true;
      }
    }
  }
  if (fixed) await writeQueue(q);

  const pending = q.tasks.find((t) => t.status === "pending");
  if (!pending) return;

  // Mark as running
  pending.status = "running";
  await writeQueue(q);

  let cmd, trackPath, taskPath;
  if (pending.type === "fix") {
    taskPath = pending.task_path;
    trackPath = pending.fix_path;
    cmd = `/fix-bugs ${pending.task_path} ${pending.fix_path}`;
  } else if (pending.type === "subtask") {
    taskPath = pending.task_path;
    trackPath = pending.subtask_path;
    cmd = `/sub-task ${pending.task_path} ${pending.subtask_path}`;
  } else if (pending.type === "investigate") {
    taskPath = null;
    trackPath = `investigate-${Date.now()}`;
    const desc = pending.description.replace(
      /\s*\[--\w+(?:\s+"[^"]*")?\]/g,
      "",
    );
    cmd = `/investigate "${desc}"`;
    if (pending.target) cmd += ` --target ${pending.target}`;
    if (pending.description.includes("[--fix]")) cmd += " --fix";
    const runMatch = pending.description.match(/\[--run(?:\s+"([^"]*)")?\]/);
    if (runMatch) cmd += runMatch[1] ? ` --run "${runMatch[1]}"` : " --run";
  } else {
    // type = 'task' — run workflow
    taskPath =
      pending.task_path || `tasks/${pending.project}/${pending.task_id}`;
    trackPath = taskPath;
    cmd = `/workflow ${taskPath}`;
  }

  const targetDir =
    pending.type === "investigate"
      ? pending.target || null
      : await getTargetDir(
          pending.type === "task" ? taskPath : pending.task_path,
        );
  const args = [
    "-p",
    cmd,
    "--output-format",
    "stream-json",
    "--verbose",
    "--dangerously-skip-permissions",
  ];
  if (targetDir) args.push("--add-dir", targetDir);

  const projectName = (pending.task_path || taskPath || "").split("/")[1];
  if (projectName) {
    const projMcpFile = path.join(
      WORKSPACE,
      "projects",
      projectName,
      "mcp.json",
    );
    if (existsSync(projMcpFile)) args.push("--mcp-config", projMcpFile);
  }

  console.log(`[Queue] Starting ${pending.type || "task"}: ${cmd}`);

  const proc = spawn("claude", args, {
    cwd: WORKSPACE,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  // Track in runningWorkflows so WS clients can subscribe
  const wf = { proc, output: [], exitCode: null };
  runningWorkflows.set(trackPath, wf);
  queueRunning = { type: pending.type, path: trackPath, proc };

  // Broadcast to any subscribed WS clients
  const broadcast = (msg) => {
    wss.clients.forEach((client) => {
      if (client.readyState === 1 && client.subscribedTask === trackPath) {
        client.send(JSON.stringify(msg));
      }
    });
  };

  let stdoutBuf = "";
  let lastResultEvent = null;
  proc.stdout.on("data", (chunk) => {
    stdoutBuf += chunk.toString();
    const lines = stdoutBuf.split("\n");
    stdoutBuf = lines.pop();
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const event = JSON.parse(line);
        let text = "";
        if (event.type === "assistant" && event.message?.content) {
          for (const block of event.message.content) {
            if (block.type === "text") text += block.text;
            else if (block.type === "tool_use") {
              const name = block.name;
              const input = block.input || {};
              if (name === "Agent")
                text += `\n⚡ [Agent: ${input.description || "subagent"}] ${input.subagent_type || ""}\n`;
              else
                text += `\n[${name}] ${JSON.stringify(input).slice(0, 200)}\n`;
            }
          }
        } else if (event.type === "tool_result") {
          const content = event.content || "";
          const summary =
            typeof content === "string" ? content : JSON.stringify(content);
          if (summary.length > 0)
            text = `\n✓ [Result] ${summary.slice(0, 500)}${summary.length > 500 ? "..." : ""}\n`;
        } else if (event.type === "result" && event.result) {
          text =
            typeof event.result === "string"
              ? event.result
              : JSON.stringify(event.result);
          lastResultEvent = event;
        } else if (event.type === "result") {
          lastResultEvent = event;
        }
        if (text) {
          wf.output.push({ text, isErr: false });
          if (wf.output.length > 500)
            wf.output.splice(0, wf.output.length - 500);
          broadcast({ type: "stdout", data: text });
        }
      } catch {
        wf.output.push({ text: line, isErr: false });
        if (wf.output.length > 500) wf.output.splice(0, wf.output.length - 500);
        broadcast({ type: "stdout", data: line });
      }
    }
  });

  proc.stderr.on("data", (chunk) => {
    const text = chunk.toString();
    wf.output.push({ text, isErr: true });
    if (wf.output.length > 500) wf.output.splice(0, wf.output.length - 500);
    broadcast({ type: "stderr", data: text });
  });

  proc.on("close", async (code) => {
    wf.exitCode = code;
    broadcast({ type: "done", code });
    if (lastResultEvent)
      logUsage({
        kind: pending.type || "task",
        ref: trackPath,
        ...extractUsage(lastResultEvent),
      });
    setTimeout(() => runningWorkflows.delete(trackPath), 5 * 60 * 1000);
    queueRunning = null;
    console.log(
      `[Queue] Finished ${pending.type || "task"}: ${cmd} (exit ${code})`,
    );
    try {
      const q2 = await readQueue();
      const item = q2.tasks.find(
        (t) =>
          (t.type === "fix" && t.fix_path === pending.fix_path) ||
          (t.type === "subtask" && t.subtask_path === pending.subtask_path) ||
          (t.type !== "fix" &&
            t.type !== "subtask" &&
            t.task_path === pending.task_path &&
            t.status === "running"),
      );
      if (item) {
        // Check filesystem for actual completion (commit.md exists = success regardless of exit code)
        const itemPath = item.fix_path || item.subtask_path || item.task_path;
        const hasCommit =
          itemPath && existsSync(path.join(WORKSPACE, itemPath, "commit.md"));
        item.status = code === 0 || hasCommit ? "done" : "failed";
        item.finished_at = new Date().toISOString();
        if (code !== 0 && !hasCommit) item.error = `Exit code ${code}`;
      }
      await writeQueue(q2);

      // Auto-reindex GitNexus graph after successful completion
      if (
        item?.status === "done" &&
        targetDir &&
        existsSync(path.join(targetDir, ".gitnexus"))
      ) {
        console.log(`[Queue] Reindexing GitNexus graph for ${targetDir}`);
        const reindex = spawn("npx", ["-y", "gitnexus@latest", "analyze"], {
          cwd: targetDir,
          stdio: ["ignore", "pipe", "pipe"],
        });
        reindex.on("close", (c) =>
          console.log(
            `[Queue] GitNexus reindex ${c === 0 ? "done" : "failed"} (exit ${c})`,
          ),
        );
        reindex.on("error", () => {});
      }
    } catch {}
  });

  proc.on("error", async (err) => {
    wf.exitCode = 1;
    broadcast({ type: "error", message: err.message });
    queueRunning = null;
    console.log(`[Queue] Error ${pending.type || "task"}: ${err.message}`);
    try {
      const q2 = await readQueue();
      const item = q2.tasks.find((t) => t.status === "running");
      if (item) {
        item.status = "failed";
        item.finished_at = new Date().toISOString();
        item.error = err.message;
      }
      await writeQueue(q2);
    } catch {}
  });
}

setInterval(queueTick, 5000);

const PORT = process.env.PORT || 3001;
migrateProjectMcpFiles().catch(() => {});
server.listen(PORT, "0.0.0.0", () => {
  console.log(`Agent Coding UI → http://localhost:${PORT}`);
  console.log(`Workspace: ${WORKSPACE}`);
  console.log(`Queue cron: polling every 5s`);
});
