import { readFile, writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { spawn } from "child_process";

import { WORKSPACE } from "../lib/paths.js";
import { logUsage, extractUsage } from "../lib/usage.js";
import { readQueue, writeQueue } from "../lib/queue-file.js";
import { runningWorkflows } from "./workflows.js";
import { getDb } from "../memory/db.js";
import { injectRecallContext } from "../memory/inject.js";

// Currently executing queue item (one at a time). Module-private `let` —
// exposed via getter/setter wrappers so consumers can't accidentally reassign
// the exported `let` (Node ESM does not propagate re-binding to importers).
// `getQueueRunningInternal()` returns the raw object including `proc` for
// internal use (queueTick close handler, kill path). Public `getQueueRunning()`
// returns a shallow copy without proc.

let queueRunning = null; // { type, path, proc } | null

export function getQueueRunning() {
  if (!queueRunning) return null;
  return { type: queueRunning.type, path: queueRunning.path };
}

export function getQueueRunningInternal() {
  return queueRunning;
}

export function setQueueRunning(value) {
  queueRunning = value;
}

export function killQueueRunning() {
  if (queueRunning?.proc) {
    try {
      queueRunning.proc.kill("SIGTERM");
    } catch {}
  }
}

async function getTargetDir(taskPath) {
  const targetInfoPath = path.join(WORKSPACE, taskPath, "target-info.md");
  if (!existsSync(targetInfoPath)) return null;
  const info = await readFile(targetInfoPath, "utf8");
  const m = info.match(/\*\*Path:\*\*\s*(.+)/);
  return m ? m[1].trim() : null;
}

function makeQueueTick(wss) {
  return async function queueTick() {
    if (queueRunning) return;

    const q = await readQueue();

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
          t.status = "pending";
          t.error = null;
          fixed = true;
        }
      }
    }
    if (fixed) await writeQueue(q);

    const pending = q.tasks.find((t) => t.status === "pending");
    if (!pending) return;

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
      const fullDesc = pending.description.replace(
        /\s*\[--\w+(?:\s+"[^"]*")?\]/g,
        "",
      );
      const inline =
        fullDesc
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean)[0]
          ?.slice(0, 200)
          ?.replace(/["\\]/g, "")
          ?.trim() || "investigate from queue";
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
      taskPath =
        pending.task_path || `tasks/${pending.project}/${pending.task_id}`;
      trackPath = taskPath;
      const wfCmd =
        pending.workflow === "team" ? "/team-workflow" : "/workflow";
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

    const wf = { proc, output: [], exitCode: null };
    runningWorkflows.set(trackPath, wf);
    queueRunning = { type: pending.type, path: trackPath, proc };

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
          if (wf.output.length > 500)
            wf.output.splice(0, wf.output.length - 500);
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
          const itemPath = item.fix_path || item.subtask_path || item.task_path;
          const hasCommit =
            itemPath && existsSync(path.join(WORKSPACE, itemPath, "commit.md"));
          item.status = code === 0 || hasCommit ? "done" : "failed";
          item.finished_at = new Date().toISOString();
          if (code !== 0 && !hasCommit) item.error = `Exit code ${code}`;
        }
        await writeQueue(q2);

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
  };
}

export function startQueueCron(wss) {
  const tick = makeQueueTick(wss);
  setInterval(tick, 5000);
}
