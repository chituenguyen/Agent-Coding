import { Router } from "express";
import { readFile, writeFile, readdir, mkdir, rm } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import matter from "gray-matter";

import { agentsDir, skillsDir, commandsDir } from "../lib/paths.js";

const router = Router();

// ─── agents ─────────────────────────────────────────────────────────────────

router.get("/api/agents", async (req, res) => {
  try {
    const files = await readdir(agentsDir());
    const agents = await Promise.all(
      files
        .filter((f) => f.endsWith(".md"))
        .map(async (f) => {
          const raw = await readFile(path.join(agentsDir(), f), "utf8");
          const { data, content } = matter(raw);
          return {
            filename: f.replace(".md", ""),
            ...data,
            body: content.trim(),
          };
        }),
    );
    res.json(agents);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/api/agents", async (req, res) => {
  try {
    const { filename, name, description, model, body } = req.body;
    if (!filename) return res.status(400).json({ error: "filename required" });
    const fm = {};
    if (name) fm.name = name;
    if (description) fm.description = description;
    if (model) fm.model = model;
    const content = matter.stringify(body || "", fm);
    await writeFile(path.join(agentsDir(), `${filename}.md`), content);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put("/api/agents/:filename", async (req, res) => {
  try {
    const { name, description, model, body } = req.body;
    const fm = {};
    if (name) fm.name = name;
    if (description) fm.description = description;
    if (model) fm.model = model;
    const content = matter.stringify(body || "", fm);
    await writeFile(
      path.join(agentsDir(), `${req.params.filename}.md`),
      content,
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/api/agents/:filename", async (req, res) => {
  try {
    await rm(path.join(agentsDir(), `${req.params.filename}.md`));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── skills ──────────────────────────────────────────────────────────────────

router.get("/api/skills", async (req, res) => {
  try {
    const entries = await readdir(skillsDir(), { withFileTypes: true });
    const skills = await Promise.all(
      entries
        .filter((e) => e.isDirectory())
        .map(async (e) => {
          const skillFile = path.join(skillsDir(), e.name, "SKILL.md");
          if (!existsSync(skillFile)) return null;
          const raw = await readFile(skillFile, "utf8");
          const { data, content } = matter(raw);
          return { dirname: e.name, ...data, body: content.trim() };
        }),
    );
    res.json(skills.filter(Boolean));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/api/skills", async (req, res) => {
  try {
    const { dirname, name, description, userInvocable, body } = req.body;
    if (!dirname) return res.status(400).json({ error: "dirname required" });
    const skillDir = path.join(skillsDir(), dirname);
    await mkdir(skillDir, { recursive: true });
    const fm = {};
    if (name) fm.name = name;
    if (description) fm.description = description;
    if (userInvocable === false) fm["user-invocable"] = false;
    const content = matter.stringify(body || "", fm);
    await writeFile(path.join(skillDir, "SKILL.md"), content);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put("/api/skills/:dirname", async (req, res) => {
  try {
    const { name, description, userInvocable, body } = req.body;
    const skillDir = path.join(skillsDir(), req.params.dirname);
    const fm = {};
    if (name) fm.name = name;
    if (description) fm.description = description;
    if (userInvocable === false) fm["user-invocable"] = false;
    const content = matter.stringify(body || "", fm);
    await writeFile(path.join(skillDir, "SKILL.md"), content);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/api/skills/:dirname", async (req, res) => {
  try {
    await rm(path.join(skillsDir(), req.params.dirname), { recursive: true });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── commands ────────────────────────────────────────────────────────────────

router.get("/api/commands", async (req, res) => {
  try {
    const files = await readdir(commandsDir());
    const commands = await Promise.all(
      files
        .filter((f) => f.endsWith(".md"))
        .map(async (f) => {
          const content = await readFile(path.join(commandsDir(), f), "utf8");
          return { filename: f.replace(".md", ""), content };
        }),
    );
    res.json(commands);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/api/commands", async (req, res) => {
  try {
    const { filename, content } = req.body;
    if (!filename) return res.status(400).json({ error: "filename required" });
    await writeFile(path.join(commandsDir(), `${filename}.md`), content || "");
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put("/api/commands/:filename", async (req, res) => {
  try {
    await writeFile(
      path.join(commandsDir(), `${req.params.filename}.md`),
      req.body.content || "",
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/api/commands/:filename", async (req, res) => {
  try {
    await rm(path.join(commandsDir(), `${req.params.filename}.md`));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
