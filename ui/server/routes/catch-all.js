import { Router } from "express";
import { existsSync } from "fs";
import path from "path";

import { UI_DIR } from "../lib/paths.js";

const router = Router();

// SPA fallback — MUST be mounted LAST.
router.get("*", (req, res) => {
  const indexPath = path.join(UI_DIR, "dist/index.html");
  if (existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).send('Run "npm run build" first, or use "npm run dev".');
  }
});

export default router;
