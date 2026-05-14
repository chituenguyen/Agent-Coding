import path from "path";
import { readdir, readFile, stat } from "fs/promises";
import { existsSync } from "fs";
import { createReadStream } from "fs";
import { createInterface } from "readline";
import chokidar from "chokidar";

const IDLE_WINDOW_MS = 5000;

export function startIndexer({ db, root = null, logger = console }) {
  if (!root) {
    const home = process.env.HOME || process.env.USERPROFILE || "/";
    root = path.join(home, ".claude/projects");
  }

  if (!existsSync(root)) {
    logger.info("memory: projects directory not found, skipping indexer");
    return { stop: () => {} };
  }

  const pending = new Map();
  let watcher = null;
  let stopped = false;

  // Bulk-index on boot
  setImmediate(() => {
    bulkIndex(db, root, logger).catch((err) =>
      logger.error("indexer bulk", err),
    );
  });

  function scheduleParse(p) {
    if (stopped) return;
    if (pending.has(p)) clearTimeout(pending.get(p));
    pending.set(
      p,
      setTimeout(() => {
        if (stopped) return;
        pending.delete(p);
        parseFromWatermark(p).catch((err) =>
          logger.error("indexer parse", p, err),
        );
      }, IDLE_WINDOW_MS),
    );
  }

  async function parseFromWatermark(p) {
    try {
      const stats = await stat(p);
      const watermark = db
        .prepare("SELECT * FROM watermarks WHERE source_path = ?")
        .get(p) || { byte_offset: 0, mtime_ms: 0 };

      // No change
      if (
        watermark.mtime_ms === stats.mtimeMs &&
        watermark.byte_offset === stats.size
      ) {
        return;
      }

      // Truncation: delete all rows for this file
      if (stats.size < watermark.byte_offset) {
        db.prepare("DELETE FROM turns WHERE source_path = ?").run(p);
        db.prepare("DELETE FROM watermarks WHERE source_path = ?").run(p);
        watermark.byte_offset = 0;
      }

      // Parse from watermark
      const rows = [];
      const rl = createInterface({
        input: createReadStream(p, { start: watermark.byte_offset }),
        crlfDelay: Infinity,
      });

      let bytePos = watermark.byte_offset;
      for await (const line of rl) {
        bytePos += Buffer.byteLength(line) + 1; // +1 for newline

        if (!line.trim()) continue;
        try {
          const json = JSON.parse(line);
          const row = extractTurn(json, p);
          if (row) {
            row.byte_offset = bytePos;
            rows.push(row);
          }
        } catch {
          // Skip malformed lines
        }
      }

      // Batch insert
      if (rows.length > 0) {
        const insert = db.prepare(`
          INSERT INTO turns (session_id, project, source_path, ts, role, text, files, tools, byte_offset)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        db.transaction(() => {
          for (const row of rows) {
            insert.run(
              row.session_id,
              row.project,
              row.source_path,
              row.ts,
              row.role,
              row.text,
              row.files,
              row.tools,
              row.byte_offset,
            );
          }
        })();
      }

      // Update watermark
      const now = Date.now();
      db.prepare(
        "INSERT OR REPLACE INTO watermarks (source_path, byte_offset, mtime_ms, last_indexed, status) VALUES (?, ?, ?, ?, ?)",
      ).run(p, stats.size, stats.mtimeMs, now, "done");
    } catch (err) {
      logger.error("parseFromWatermark", p, err);
    }
  }

  // Watch and debounce
  if (!stopped) {
    watcher = chokidar.watch(path.join(root, "**/*.jsonl"), {
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: false,
    });

    watcher.on("change", (p) => scheduleParse(p));
    watcher.on("unlink", (p) => {
      if (pending.has(p)) clearTimeout(pending.get(p));
      pending.delete(p);
      db.prepare("DELETE FROM turns WHERE source_path = ?").run(p);
      db.prepare("DELETE FROM watermarks WHERE source_path = ?").run(p);
    });
  }

  return {
    stop() {
      stopped = true;
      for (const handle of pending.values()) clearTimeout(handle);
      pending.clear();
      if (watcher) watcher.close();
    },
  };
}

async function bulkIndex(db, root, logger) {
  const files = await findJsonlFiles(root);
  const alreadyIndexed = new Set(
    db
      .prepare("SELECT source_path FROM watermarks")
      .all()
      .map((r) => r.source_path),
  );

  const toIndex = [];
  for (const p of files) {
    const stats = await stat(p);
    const watermark = alreadyIndexed.has(p)
      ? db.prepare("SELECT * FROM watermarks WHERE source_path = ?").get(p)
      : null;

    if (!watermark || watermark.mtime_ms < stats.mtimeMs) {
      toIndex.push(p);
    }
  }

  logger.info(`memory: indexing ${toIndex.length}/${files.length} files`);

  for (let i = 0; i < toIndex.length; i++) {
    const p = toIndex[i];
    await new Promise((resolve) => {
      setImmediate(async () => {
        try {
          const rl = createInterface({
            input: createReadStream(p),
            crlfDelay: Infinity,
          });

          const rows = [];
          let bytePos = 0;
          for await (const line of rl) {
            bytePos += Buffer.byteLength(line) + 1;
            if (!line.trim()) continue;
            try {
              const json = JSON.parse(line);
              const row = extractTurn(json, p);
              if (row) {
                row.byte_offset = bytePos;
                rows.push(row);
              }
            } catch {
              // Skip malformed
            }
          }

          if (rows.length > 0) {
            const insert = db.prepare(`
              INSERT INTO turns (session_id, project, source_path, ts, role, text, files, tools, byte_offset)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);
            db.transaction(() => {
              for (const row of rows) {
                insert.run(
                  row.session_id,
                  row.project,
                  row.source_path,
                  row.ts,
                  row.role,
                  row.text,
                  row.files,
                  row.tools,
                  row.byte_offset,
                );
              }
            })();
          }

          const stats = await stat(p);
          db.prepare(
            "INSERT OR REPLACE INTO watermarks (source_path, byte_offset, mtime_ms, last_indexed, status) VALUES (?, ?, ?, ?, ?)",
          ).run(p, stats.size, stats.mtimeMs, Date.now(), "done");

          if ((i + 1) % 50 === 0) {
            logger.info(`memory: indexed ${i + 1}/${toIndex.length} files`);
          }
        } catch (err) {
          logger.error("bulk index", p, err);
        }
        resolve();
      });
    });
  }
}

async function findJsonlFiles(root) {
  const results = [];
  async function walk(dir) {
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const p = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(p);
        } else if (entry.name.endsWith(".jsonl")) {
          results.push(p);
        }
      }
    } catch {
      // Ignore errors
    }
  }
  await walk(root);
  return results;
}

function extractTurn(line, sourcePath) {
  const type = line.type;
  const timestamp = line.timestamp ? Date.parse(line.timestamp) : Date.now();

  if (line.isSidechain) return null;

  if (["queue-operation", "ai-title", "summary", "attachment"].includes(type)) {
    return null;
  }

  let text = "";
  let role = null;

  if (type === "assistant") {
    role = "assistant";
    const content = line.message?.content;
    if (Array.isArray(content)) {
      const parts = [];
      for (const b of content) {
        if (b.type === "text" && b.text) parts.push(b.text);
        if (b.type === "tool_use") {
          const summary = summarizeToolUse(b);
          if (summary) parts.push(summary);
        }
      }
      text = parts.join("\n").trim();
    } else if (typeof content === "string") {
      text = content.trim();
    }
  } else if (type === "user") {
    role = "user";
    const content = line.message?.content;
    if (typeof content === "string") {
      text = content.trim();
      if (text.length < 20) return null;
    } else if (Array.isArray(content)) {
      const parts = [];
      for (const b of content) {
        if (b.type === "text" && b.text) parts.push(b.text);
      }
      text = parts.join("\n").trim();
      if (text.length < 20) return null;
    } else {
      return null;
    }
  } else {
    return null;
  }

  if (!text) return null;

  // Extract files
  const files = new Set();
  const content = line.message?.content;
  if (Array.isArray(content)) {
    for (const b of content) {
      if (b.type === "tool_use" && b.input) {
        const fp = b.input.file_path || b.input.path || b.input.notebook_path;
        if (fp) files.add(fp);
      }
      if (b.type === "tool_result" && b.content) {
        if (typeof b.content === "string") {
          const matches = b.content.match(/@[/a-zA-Z0-9._-]+/g) || [];
          for (const m of matches) {
            const p = m.slice(1);
            if (p.startsWith("/")) files.add(p);
          }
        }
      }
    }
  }
  if (typeof content === "string") {
    const matches = content.match(/@[/a-zA-Z0-9._-]+/g) || [];
    for (const m of matches) {
      const p = m.slice(1);
      if (p.startsWith("/")) files.add(p);
    }
  }

  // Extract tools
  const tools = new Set();
  if (Array.isArray(content)) {
    for (const b of content) {
      if (b.type === "tool_use" && b.name) tools.add(b.name);
    }
  }

  // Project name
  const project = projectFromDir(sourcePath);

  // Session ID
  const sessionId = line.session_id || "unknown";

  if (!text) return null;

  return {
    session_id: sessionId,
    project,
    source_path: sourcePath,
    ts: timestamp,
    role,
    text,
    files: JSON.stringify(Array.from(files)),
    tools: JSON.stringify(Array.from(tools)),
  };
}

function summarizeToolUse(toolUse) {
  const name = toolUse.name || "Unknown";
  const input = toolUse.input || {};

  if (name === "Edit") {
    const file = input.file_path || input.path || "?";
    const changed = input.old_string ? "changed" : "modified";
    return `Edit ${file}: ${changed}`;
  }
  if (name === "Write") {
    const file = input.file_path || input.path || "?";
    return `Write ${file}: created`;
  }
  if (name === "Read") {
    const file = input.file_path || input.path || "?";
    return `Read ${file}`;
  }
  if (name === "Bash") {
    const cmd = input.command || input.text || "?";
    return `Bash: ${cmd.slice(0, 120)}`;
  }
  if (name === "find") {
    const query = input.query || "?";
    return `Find: ${query.slice(0, 80)}`;
  }
  if (name === "grep") {
    const pattern = input.pattern || "?";
    const path = input.path || input.file_path || "?";
    return `Grep "${pattern}" in ${path}`;
  }

  // Generic
  const json = JSON.stringify(input).slice(0, 120);
  return `${name}: ${json}`;
}

function projectFromDir(sourcePath) {
  try {
    const dir = path.dirname(sourcePath);
    const base = path.basename(dir);
    if (base.startsWith("-")) {
      const abs = "/" + base.slice(1).replace(/-/g, "/");
      return path.basename(abs) || base;
    }
  } catch {}
  return path.basename(path.dirname(sourcePath)) || "unknown";
}
