import { Router } from "express";
import { readFile } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { spawn } from "child_process";

import { WORKSPACE } from "../lib/paths.js";

const router = Router();

router.get("/api/repositories/:project/graph", async (req, res) => {
  try {
    const { project } = req.params;
    const contextFile = path.join(WORKSPACE, "projects", project, "context.md");
    if (!existsSync(contextFile))
      return res.status(404).json({ error: "Project not found" });

    // Get repo path from context.md
    const content = await readFile(contextFile, "utf8");
    const m = content.match(/\*\*Repo path:\*\*\s*(.+)/);
    if (!m || m[1].trim() === "N/A")
      return res.status(400).json({ error: "No repo path" });
    const repoPath = m[1].trim();

    // Check if gitnexus is indexed
    if (!existsSync(path.join(repoPath, ".gitnexus"))) {
      return res.json({ indexed: false, nodes: [], edges: [] });
    }

    // Run cypher queries for nodes and edges
    const runCypher = (query) =>
      new Promise((resolve) => {
        const proc = spawn("npx", ["-y", "gitnexus@latest", "cypher", query], {
          cwd: repoPath,
          stdio: ["ignore", "pipe", "pipe"],
        });
        let out = "";
        proc.stdout.on("data", (c) => {
          out += c.toString();
        });
        proc.on("close", (code) => {
          if (code !== 0) {
            resolve({ markdown: "", row_count: 0 });
            return;
          }
          try {
            resolve(JSON.parse(out));
          } catch {
            resolve({ markdown: "", row_count: 0 });
          }
        });
        proc.on("error", () => resolve({ markdown: "", row_count: 0 }));
      });

    const parseTable = (md) => {
      if (!md) return [];
      const lines = md.trim().split("\n");
      if (lines.length < 3) return [];
      const headers = lines[0]
        .split("|")
        .map((h) => h.trim())
        .filter(Boolean);
      return lines.slice(2).map((line) => {
        const vals = line
          .split("|")
          .map((v) => v.trim())
          .filter(Boolean);
        return Object.fromEntries(headers.map((h, i) => [h, vals[i] || ""]));
      });
    };

    const [nodesResult, edgesResult] = await Promise.all([
      runCypher(
        "MATCH (n) WHERE labels(n) <> 'Folder' RETURN id(n) as id, n.name as name, labels(n) as kind, n.filePath as file",
      ),
      runCypher(
        "MATCH (n)-[r:CodeRelation]->(m) WHERE labels(n) <> 'Folder' AND labels(m) <> 'Folder' RETURN id(n) as source, id(m) as target, r.type as rel, n.name as sourceName, m.name as targetName",
      ),
    ]);

    const nodes = parseTable(nodesResult.markdown);
    const edges = parseTable(edgesResult.markdown);

    res.json({ indexed: true, nodes, edges });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/api/repositories/:project/graph/index", async (req, res) => {
  try {
    const { project } = req.params;
    const content = await readFile(
      path.join(WORKSPACE, "projects", project, "context.md"),
      "utf8",
    );
    const m = content.match(/\*\*Repo path:\*\*\s*(.+)/);
    if (!m) return res.status(400).json({ error: "No repo path" });
    const repoPath = m[1].trim();

    const proc = spawn("npx", ["-y", "gitnexus@latest", "analyze"], {
      cwd: repoPath,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    proc.stdout.on("data", (c) => {
      out += c.toString();
    });
    proc.on("close", (code) => {
      res.json({ ok: code === 0, output: out.trim() });
    });
    proc.on("error", (err) => res.status(500).json({ error: err.message }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
