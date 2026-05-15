import { readFile } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { spawn } from "child_process";
import crypto from "crypto";
import matter from "gray-matter";

import { WORKSPACE, agentsDir } from "./lib/paths.js";
import { logUsage, extractUsage } from "./lib/usage.js";
import { findTeam } from "./lib/companies.js";
import { chatSpawnCwd, readChat, writeChat } from "./lib/chat-files.js";
import { runCompactIfNeeded } from "./lib/compact.js";
import { runningWorkflows } from "./state/workflows.js";
import { remoteSession, parseCookies } from "./state/remote.js";
import {
  activeChatProcs,
  chatSubscribers,
  rememberEditedPath,
  addChatSubscriber,
  broadcastToChat,
} from "./state/chat.js";
import { getDb } from "./memory/db.js";
import { injectRecallContext } from "./memory/inject.js";
import { readQueue, writeQueue } from "./lib/queue-file.js";

export function attachWebSocket(wss) {
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

        const existing = runningWorkflows.get(taskPath);
        if (existing && existing.exitCode === null) {
          ws.subscribedTask = taskPath;
          safeSend({ type: "started", taskPath });
          for (const line of existing.output) {
            safeSend({
              type: line.isErr ? "stderr" : "stdout",
              data: line.text,
            });
          }
          return;
        }

        const targetInfoPath = path.join(WORKSPACE, taskPath, "target-info.md");
        let targetDir = null;
        if (existsSync(targetInfoPath)) {
          const info = await readFile(targetInfoPath, "utf8");
          const m = info.match(/\*\*Path:\*\*\s*(.+)/);
          if (m) targetDir = m[1].trim();
        }

        const args = [
          "-p",
          `/workflow ${taskPath}`,
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
                      text += `\n⚡ [Agent: ${input.description || "subagent"}] ${input.subagent_type || ""} (${input.model || "default"})\n`;
                    } else {
                      text += `\n[${name}] ${JSON.stringify(input).slice(0, 200)}\n`;
                    }
                  }
                }
              } else if (event.type === "tool_result") {
                const content = event.content || "";
                const summary =
                  typeof content === "string"
                    ? content
                    : JSON.stringify(content);
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
          if (wf.output.length > 500)
            wf.output.splice(0, wf.output.length - 500);
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
          setTimeout(() => runningWorkflows.delete(taskPath), 5 * 60 * 1000);
        });
        proc.on("error", (err) => {
          wf.exitCode = 1;
          safeSend({ type: "error", message: err.message });
        });
      }

      if (msg.action === "run-fix") {
        const { taskPath, fixPath } = msg;

        const existing = runningWorkflows.get(fixPath);
        if (existing && existing.exitCode === null) {
          ws.subscribedTask = fixPath;
          safeSend({ type: "started", taskPath: fixPath });
          for (const line of existing.output) {
            safeSend({
              type: line.isErr ? "stderr" : "stdout",
              data: line.text,
            });
          }
          return;
        }

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
                  typeof content === "string"
                    ? content
                    : JSON.stringify(content);
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
          if (wf.output.length > 500)
            wf.output.splice(0, wf.output.length - 500);
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
            safeSend({
              type: line.isErr ? "stderr" : "stdout",
              data: line.text,
            });
          }
          return;
        }

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
                  typeof content === "string"
                    ? content
                    : JSON.stringify(content);
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
          if (wf.output.length > 500)
            wf.output.splice(0, wf.output.length - 500);
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
                  typeof content === "string"
                    ? content
                    : JSON.stringify(content);
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
          safeSend({
            type: "chat-error",
            error: "chatId and message required",
          });
          return;
        }

        const chat = await readChat(chatId);
        if (!chat) {
          safeSend({ type: "chat-error", error: "Chat not found" });
          return;
        }

        const compacted = await runCompactIfNeeded(chat, (evt) => {
          safeSend(evt);
          broadcastToChat(chatId, evt);
        });
        if (compacted) await writeChat(chat);

        if (activeChatProcs.has(chatId)) {
          safeSend({
            type: "chat-error",
            error:
              "This chat is already running. Wait for the current turn to finish (or press Stop) before sending again.",
          });
          return;
        }

        const attachmentList = Array.isArray(attachments)
          ? attachments
              .filter((a) => a?.path && existsSync(a.path))
              .slice(0, 10)
          : [];

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
          !chat.title ||
          chat.title === "New chat" ||
          chat.title === "New thread";
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
          const modelMap = {
            sonnet: "sonnet",
            opus: "opus",
            "opus-4-6": "claude-opus-4-6",
            haiku: "haiku",
          };
          const arg = modelMap[chat.model];
          if (arg) args.push("--model", arg);
        }

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

        const VALID_EFFORTS = ["low", "medium", "high", "xhigh", "max"];
        const effortToUse =
          chat.effort && VALID_EFFORTS.includes(chat.effort)
            ? chat.effort
            : agentEffort;
        if (effortToUse && VALID_EFFORTS.includes(effortToUse)) {
          args.push("--effort", effortToUse);
        }

        if (chat.planMode) {
          args.push("--permission-mode", "plan");
        }

        args.push("--chrome");

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
}
