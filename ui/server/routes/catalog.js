import { Router } from "express";
import { readMcpServer, writeMcpServer } from "../lib/mcp-config.js";

const router = Router();

router.get("/api/catalog", async (req, res) => {
  const data = await readMcpServer();
  res.json(data.catalog || []);
});

router.post("/api/catalog", async (req, res) => {
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

router.delete("/api/catalog/:name", async (req, res) => {
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

export default router;
