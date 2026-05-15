import { Router } from "express";
import { writeFile, readdir, stat, mkdir, rm } from "fs/promises";
import { existsSync } from "fs";
import path from "path";

import { WORKSPACE } from "../lib/paths.js";
import { readIfExists } from "../lib/fs-json.js";
import { readQueue, writeQueue } from "../lib/queue-file.js";
import { runningWorkflows } from "../state/workflows.js";

const router = Router();

router.post("/api/tasks/:project/:taskId/fixes", async (req, res) => {
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

router.get("/api/tasks/:project/:taskId/fixes", async (req, res) => {
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

router.post(
  "/api/tasks/:project/:taskId/fixes/:fixId/reset",
  async (req, res) => {
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
  },
);

router.delete("/api/tasks/:project/:taskId/fixes/:fixId", async (req, res) => {
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

export default router;
