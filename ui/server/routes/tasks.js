import { Router } from "express";
import { readFile, writeFile, readdir, stat, mkdir, rm } from "fs/promises";
import { existsSync } from "fs";
import path from "path";

import { WORKSPACE } from "../lib/paths.js";
import { readIfExists } from "../lib/fs-json.js";
import {
  deriveStatus,
  parseInputMd,
  getCompanyForPath,
} from "../lib/task-helpers.js";
import { readProjectMcpConfig } from "../lib/mcp-config.js";
import { linkRepo, ensureGitignore } from "../lib/workspace-links.js";
import { readQueue, writeQueue } from "../lib/queue-file.js";
import { runningWorkflows } from "../state/workflows.js";
import { getQueueRunning } from "../state/queue-runtime.js";

const router = Router();

router.get("/api/tasks", async (req, res) => {
  try {
    const tasksDir = path.join(WORKSPACE, "tasks");
    if (!existsSync(tasksDir)) return res.json([]);

    const wantCompany = req.query.companyId || null;
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

        const companyId =
          meta.companyId || (await getCompanyForPath(meta.targetPath));
        if (wantCompany && companyId !== wantCompany) continue;

        const taskPath = `tasks/${project}/${taskId}`;
        const fsStatus = deriveStatus(taskDir);
        const wf = runningWorkflows.get(taskPath);
        const qr = getQueueRunning();
        const isRunning =
          !!(wf && wf.exitCode === null) || !!(qr && qr.path === taskPath);

        tasks.push({
          taskId,
          project,
          companyId,
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

router.get("/api/tasks/:project/:taskId", async (req, res) => {
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

router.delete("/api/tasks/:project/:taskId", async (req, res) => {
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

router.post("/api/tasks/:project/:taskId/subtasks", async (req, res) => {
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

router.get("/api/tasks/:project/:taskId/subtasks", async (req, res) => {
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

router.post(
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
      await mkdir(path.join(subtaskDir, "research"), { recursive: true });
      await mkdir(path.join(subtaskDir, "review"), { recursive: true });
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

router.delete(
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

router.post("/api/tasks", async (req, res) => {
  try {
    const { description, targetPath, ticketId } = req.body;
    if (!description?.trim())
      return res.status(400).json({ error: "description required" });

    const companyId =
      (typeof req.body?.companyId === "string" && req.body.companyId) ||
      (await getCompanyForPath(targetPath)) ||
      null;

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
**Project:** ${project}${companyId ? `\n**Company:** ${companyId}` : ""}
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
        /* ignore */
      }
    }

    if (targetPath && existsSync(targetPath)) {
      try {
        const linkResult = await linkRepo(targetPath);
        const ignoreResult = await ensureGitignore(targetPath);
        console.error(
          `[create-task] linked ${linkResult.created} new (${linkResult.skipped} existing, ${linkResult.overrides.length} overrides); gitignore appended=${ignoreResult.appended}`,
        );
      } catch (err) {
        console.error(`[create-task] linkRepo failed: ${err.message}`);
      }
    }

    res.json({
      taskId,
      project,
      companyId,
      taskDir: `tasks/${project}/${taskId}`,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
