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
import { attachWebSocket } from "./server/ws.js";
import queueRouter from "./server/routes/queue.js";

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

app.use(queueRouter);

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

attachWebSocket(wss);

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
