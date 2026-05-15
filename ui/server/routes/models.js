import { Router } from "express";
import { detectClaudeModels } from "../lib/models.js";

const router = Router();

router.get("/api/models", (req, res) => {
  try {
    res.json(detectClaudeModels());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
