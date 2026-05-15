import { Router } from "express";

import { readQueue, writeQueue } from "../lib/queue-file.js";
import { getCompanyForPath } from "../lib/task-helpers.js";
import { getQueueRunningInternal } from "../state/queue-runtime.js";

const router = Router();

router.get("/api/queue", async (req, res) => {
  try {
    const queue = await readQueue();
    const wantCompany = req.query.companyId || null;
    if (!wantCompany) return res.json(queue);
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

router.post("/api/queue/add", async (req, res) => {
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
      type: type || "task",
      task_id: task_id || null,
      project: project || null,
      task_path: task_path || null,
      fix_path: fix_path || null,
      subtask_path: subtask_path || null,
      workflow: workflow === "team" ? "team" : "sequential",
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

router.delete("/api/queue/clear", async (req, res) => {
  try {
    const { filter } = req.query;
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

router.post("/api/queue/retry", async (req, res) => {
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

router.post("/api/queue/cancel", async (req, res) => {
  try {
    const qr = getQueueRunningInternal();
    if (!qr) return res.status(400).json({ error: "Nothing is running" });
    const { proc, path: trackPath } = qr;
    console.log(`[Queue] Cancelling: ${trackPath}`);
    proc.kill("SIGTERM");
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/api/queue/remove", async (req, res) => {
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

router.post("/api/queue/reorder", async (req, res) => {
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

export default router;
