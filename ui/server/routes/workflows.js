import { Router } from "express";

import { runningWorkflows } from "../state/workflows.js";
import {
  getQueueRunning,
  getQueueRunningInternal,
} from "../state/queue-runtime.js";

// Factory: accepts the WebSocketServer so the /stop handler can notify
// subscribed clients without routes/ importing from ws.js.
export default function createWorkflowsRouter(wss) {
  const router = Router();

  router.get("/api/workflows/:taskPath(*)", (req, res) => {
    const wf = runningWorkflows.get(req.params.taskPath);
    if (!wf) return res.json({ running: false });
    res.json({
      running: wf.exitCode === null,
      exitCode: wf.exitCode,
      output: wf.output,
    });
  });

  router.post("/api/workflows/:taskPath(*)/stop", (req, res) => {
    const taskPath = req.params.taskPath;
    const wf = runningWorkflows.get(taskPath);
    if (!wf || wf.exitCode !== null) {
      const qr = getQueueRunningInternal();
      if (qr && qr.path === taskPath) {
        qr.proc.kill("SIGTERM");
        return res.json({ ok: true });
      }
      return res.status(404).json({ error: "Not running" });
    }
    wf.proc.kill("SIGINT");
    wf.exitCode = -1;
    runningWorkflows.delete(taskPath);
    if (wss) {
      wss.clients.forEach((client) => {
        if (client.readyState === 1 && client.subscribedTask === taskPath) {
          client.send(JSON.stringify({ type: "stopped" }));
        }
      });
    }
    res.json({ ok: true });
  });

  router.get("/api/queue/status", (req, res) => {
    res.json({ running: getQueueRunning() });
  });

  return router;
}
