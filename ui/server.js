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
import { startQueueCron } from "./server/state/queue-runtime.js";
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
startQueueCron(wss);

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
