import express from "express";
import { createServer } from "http";
import { WebSocketServer } from "ws";
import matter from "gray-matter";
import { spawn, execSync } from "child_process";
import { getDb } from "./server/memory/db.js";
import { startIndexer } from "./server/memory/indexer.js";
import { recallContext } from "./server/memory/recall.js";
import { injectRecallContext } from "./server/memory/inject.js";
import {
  readdir,
  readFile,
  writeFile,
  appendFile,
  mkdir,
  rm,
  stat,
  lstat,
  readlink,
  symlink,
  unlink,
  rename,
} from "fs/promises";
import { existsSync, realpathSync, statSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";
import QRCode from "qrcode";
import {
  WORKSPACE,
  PORT,
  CLOUDFLARED_BIN,
  mcpServerPath,
  queuePath,
  usagePath,
  attachmentsDir,
  chatsDir,
  agentsDir,
  skillsDir,
  commandsDir,
  WORKSPACE_NAME_FILE,
  DEFAULT_WORKSPACE_NAME,
  GLOBAL_SETTINGS,
  GLOBAL_CLAUDE_JSON,
  PROJECT_MCP_JSON,
} from "./server/lib/paths.js";
import {
  readIfExists,
  readJsonSafe,
  statSafe,
  lstatSafe,
  listDirEntries,
} from "./server/lib/fs-json.js";
import {
  readMcpServer,
  writeMcpServer,
  readProjectMcpConfig,
  writeProjectMcpConfig,
  migrateProjectMcpFiles,
  getRepos,
  readProjectMcp,
  writeProjectMcp,
} from "./server/lib/mcp-config.js";
import { logUsage, extractUsage } from "./server/lib/usage.js";
import { readGlobalClaude } from "./server/lib/claude-json.js";
import catalogRouter from "./server/routes/catalog.js";
import modelsRouter from "./server/routes/models.js";
import workspaceRouter from "./server/routes/workspace.js";
import settingsRouter from "./server/routes/settings.js";
import claudeFsRouter from "./server/routes/claude-fs.js";
import graphRouter from "./server/routes/graph.js";
import {
  slugifyCompanyId,
  readCompaniesFile,
  writeCompaniesFile,
  defaultEngineerRoom,
  saveCompanyLogo,
  findTeam,
  buildCompanyPathMap,
  lookupCompanyForPath,
} from "./server/lib/companies.js";
import companiesRouter from "./server/routes/companies.js";
import {
  linkRepo,
  unlinkRepo,
  checkLinks,
  repairLinks,
  ensureGitignore,
} from "./server/lib/workspace-links.js";
import repositoriesRouter from "./server/routes/repositories.js";
import { remoteSession, parseCookies } from "./server/state/remote.js";
import remoteRouter from "./server/routes/remote.js";
import monitorRouter from "./server/routes/monitor.js";
import { createApp } from "./server/app.js";
import {
  activeChatProcs,
  chatSubscribers,
  chatEditedPaths,
  rememberEditedPath,
  addChatSubscriber,
  broadcastToChat,
} from "./server/state/chat.js";
import {
  chatPath,
  ensureChatsDir,
  readChat,
  writeChat,
  sanitizeFilename,
  chatSpawnCwd,
} from "./server/lib/chat-files.js";
import {
  AUTO_COMPACT_TOKENS,
  runCompactIfNeeded,
} from "./server/lib/compact.js";
import chatRouter from "./server/routes/chat.js";
import { runningWorkflows } from "./server/state/workflows.js";
import {
  getQueueRunning,
  getQueueRunningInternal,
  setQueueRunning,
  killQueueRunning,
} from "./server/state/queue-runtime.js";
import {
  deriveStatus,
  parseInputMd,
  getCompanyForPath,
} from "./server/lib/task-helpers.js";
import { readQueue, writeQueue } from "./server/lib/queue-file.js";
import tasksRouter from "./server/routes/tasks.js";
import fixesRouter from "./server/routes/fixes.js";
import createWorkflowsRouter from "./server/routes/workflows.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = createApp();
const server = createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });

app.use(tasksRouter);
app.use(fixesRouter);
app.use(catalogRouter);

// ─── repositories (per-project MCP management) ─────────────────────────────

app.use(companiesRouter);

app.use(repositoriesRouter);
app.use(graphRouter);

// ─── queue ───────────────────────────────────────────────────────────────────

app.get("/api/queue", async (req, res) => {
  try {
    const queue = await readQueue();
    const wantCompany = req.query.companyId || null;
    if (!wantCompany) return res.json(queue);
    // Filter by companyId. For legacy items missing the field, infer from
    // target / task_path so they don't disappear entirely.
    const filtered = [];
    for (const t of queue.tasks || []) {
      let cid = t.companyId || null;
      if (!cid) cid = await getCompanyForPath(t.target || "");
      if (cid === wantCompany) filtered.push({ ...t, companyId: cid });
    }
    res.json({ ...queue, tasks: filtered });
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
      workflow,
      companyId,
    } = req.body;
    if (!description?.trim())
      return res.status(400).json({ error: "description required" });
    const cid =
      (typeof companyId === "string" && companyId) ||
      (await getCompanyForPath(target)) ||
      null;
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
      workflow: workflow === "team" ? "team" : "sequential", // /workflow vs /team-workflow
      companyId: cid,
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
    const qr = getQueueRunningInternal();
    if (!qr) return res.status(400).json({ error: "Nothing is running" });
    const { proc, path: trackPath } = qr;
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

app.use(settingsRouter);

app.use(claudeFsRouter);

app.use(workspaceRouter);

// ─── running workflows (global, survives WebSocket disconnect) ──────────────

app.use(createWorkflowsRouter(wss));

app.use(remoteRouter);
app.use(monitorRouter);
app.use(chatRouter);
app.use(modelsRouter);

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

      const db = await getDb();
      const finalArgs = await injectRecallContext(args, {
        workspace: WORKSPACE,
        project: projectName,
        prompt: `/workflow ${taskPath}`,
        files: [],
        db,
      });
      const spawnCwd = targetDir || WORKSPACE;
      if (spawnCwd !== WORKSPACE) finalArgs.push("--add-dir", WORKSPACE);
      const proc = spawn("claude", finalArgs, {
        cwd: spawnCwd,
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

      const db = await getDb();
      const finalArgs = await injectRecallContext(args, {
        workspace: WORKSPACE,
        project: projectName,
        prompt: `/fix-bugs ${taskPath} ${fixPath}`,
        files: [],
        db,
      });
      const spawnCwd = targetDir || WORKSPACE;
      if (spawnCwd !== WORKSPACE) finalArgs.push("--add-dir", WORKSPACE);
      const proc = spawn("claude", finalArgs, {
        cwd: spawnCwd,
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

      const db = await getDb();
      const finalArgs = await injectRecallContext(args, {
        workspace: WORKSPACE,
        project: projectName,
        prompt: `/sub-task ${taskPath} ${subtaskPath}`,
        files: [],
        db,
      });
      const spawnCwd = targetDir || WORKSPACE;
      if (spawnCwd !== WORKSPACE) finalArgs.push("--add-dir", WORKSPACE);
      const proc = spawn("claude", finalArgs, {
        cwd: spawnCwd,
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

      const args = [
        "-p",
        command,
        "--output-format",
        "stream-json",
        "--verbose",
        "--dangerously-skip-permissions",
      ];
      const db = await getDb();
      const finalArgs = await injectRecallContext(args, {
        workspace: WORKSPACE,
        project: null,
        prompt: command,
        files: [],
        db,
      });
      const proc = spawn("claude", finalArgs, {
        cwd: WORKSPACE,
        env: process.env,
        stdio: ["ignore", "pipe", "pipe"],
      });

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
      const isPlaceholder =
        !chat.title || chat.title === "New chat" || chat.title === "New thread";
      if (chat.messages.length === 1 || isPlaceholder) {
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

      if (chat.model) {
        // Map UI ids to the actual --model flag value. "opus-4-6" is the older
        // Opus generation; pass its full model id since the CLI alias is "opus".
        const modelMap = {
          sonnet: "sonnet",
          opus: "opus",
          "opus-4-6": "claude-opus-4-6",
          haiku: "haiku",
        };
        const arg = modelMap[chat.model];
        if (arg) args.push("--model", arg);
      }

      // Investigations and other dedicated-agent chats route every turn through
      // the chosen sub-agent so the conversation stays focused on its persona.
      // Resolution order: curated slug in .claude/agents/ first, then inline
      // agentDef on the team (designer-generated rooms).
      let agentEffort = null;
      if (chat.agent && /^[\w-]+$/.test(chat.agent)) {
        args.push("--agent", chat.agent);
        try {
          const agentFile = path.join(agentsDir(), `${chat.agent}.md`);
          if (existsSync(agentFile)) {
            const raw = await readFile(agentFile, "utf8");
            const fm = matter(raw).data || {};
            if (fm.effort) agentEffort = fm.effort;
          }
        } catch {}
      } else if (chat.kind === "team" && chat.companyId && chat.teamId) {
        try {
          const found = await findTeam(chat.companyId, chat.teamId);
          if (found?.team?.agentDef?.systemPrompt) {
            args.push("--system-prompt", found.team.agentDef.systemPrompt);
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

      // Folder mentions are exposed via --add-dir so Claude can read/write
      // inside them. cwd is flipped to the first mentioned folder (if any) so
      // the target repo's CLAUDE.md and per-repo agents resolve natively.
      const folderPaths = (chat.folderPaths || []).filter(
        (p) => p && p !== WORKSPACE && existsSync(p),
      );
      for (const extra of folderPaths) args.push("--add-dir", extra);

      const db = await getDb();
      const finalArgs = await injectRecallContext(args, {
        workspace: WORKSPACE,
        project: chat.companyId || null,
        prompt: message,
        files: folderPaths,
        db,
      });
      const spawnCwd = chatSpawnCwd(chat);
      if (spawnCwd !== WORKSPACE) finalArgs.push("--add-dir", WORKSPACE);
      const proc = spawn("claude", finalArgs, {
        cwd: spawnCwd,
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

async function getTargetDir(taskPath) {
  const targetInfoPath = path.join(WORKSPACE, taskPath, "target-info.md");
  if (!existsSync(targetInfoPath)) return null;
  const info = await readFile(targetInfoPath, "utf8");
  const m = info.match(/\*\*Path:\*\*\s*(.+)/);
  return m ? m[1].trim() : null;
}

async function queueTick() {
  // Skip if something is already running
  if (getQueueRunningInternal()) return;

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
    trackPath = `investigate-${Date.now()}`;
    taskPath = null;
    // Strip the [--flag] tokens we appended in the UI.
    const fullDesc = pending.description.replace(
      /\s*\[--\w+(?:\s+"[^"]*")?\]/g,
      "",
    );
    // Short inline summary safe to pass as a quoted slash-command arg.
    const inline =
      fullDesc
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean)[0]
        ?.slice(0, 200)
        ?.replace(/["\\]/g, "")
        ?.trim() || "investigate from queue";
    // Always write the full packaged context (multi-line, may contain quotes)
    // to a sidecar markdown file so /investigate can read it without us having
    // to shell-escape every edge case.
    const ctxDir = path.join(WORKSPACE, "tasks", "__investigations");
    await mkdir(ctxDir, { recursive: true });
    const ctxFile = path.join(ctxDir, `${trackPath}.md`);
    await writeFile(ctxFile, fullDesc);
    const relCtxFile = path.relative(WORKSPACE, ctxFile);
    cmd = `/investigate "${inline}" --context-file ${relCtxFile}`;
    if (pending.target) cmd += ` --target ${pending.target}`;
    if (pending.description.includes("[--fix]")) cmd += " --fix";
    const runMatch = pending.description.match(/\[--run(?:\s+"([^"]*)")?\]/);
    if (runMatch) cmd += runMatch[1] ? ` --run "${runMatch[1]}"` : " --run";
    if (pending.workflow === "team") cmd += " --team";
  } else {
    // type = 'task' — run workflow. `pending.workflow` is set when the user
    // chose team-workflow at task creation; default falls back to /workflow.
    taskPath =
      pending.task_path || `tasks/${pending.project}/${pending.task_id}`;
    trackPath = taskPath;
    const wfCmd = pending.workflow === "team" ? "/team-workflow" : "/workflow";
    cmd = `${wfCmd} ${taskPath}`;
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

  const db = await getDb();
  const finalArgs = await injectRecallContext(args, {
    workspace: WORKSPACE,
    project: projectName || null,
    prompt: cmd,
    files: [],
    db,
  });
  const spawnCwd = targetDir || WORKSPACE;
  if (spawnCwd !== WORKSPACE) finalArgs.push("--add-dir", WORKSPACE);
  const proc = spawn("claude", finalArgs, {
    cwd: spawnCwd,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  // Track in runningWorkflows so WS clients can subscribe
  const wf = { proc, output: [], exitCode: null };
  runningWorkflows.set(trackPath, wf);
  setQueueRunning({ type: pending.type, path: trackPath, proc });

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
    setQueueRunning(null);
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
    setQueueRunning(null);
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

migrateProjectMcpFiles().catch(() => {});

(async () => {
  const db = await getDb();
  if (db) {
    startIndexer({ db, logger: console });
  }

  // Workspace → repo link health check (advisory; never auto-repairs).
  (async () => {
    try {
      const repos = await getRepos();
      for (const r of repos || []) {
        if (!r.path || !existsSync(r.path)) continue;
        try {
          const status = await checkLinks(r.path);
          console.error(`[link-check] ${r.name}: ${status.status}`);
        } catch (err) {
          console.error(`[link-check] ${r.name}: error ${err.message}`);
        }
      }
    } catch (err) {
      console.error(`[link-check] failed: ${err.message}`);
    }
  })();

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`URI Platform UI → http://localhost:${PORT}`);
    console.log(`Workspace: ${WORKSPACE}`);
    console.log(`Queue cron: polling every 5s`);
  });
})();
