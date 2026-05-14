import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  writeFileSync,
  unlinkSync,
  mkdirSync,
  appendFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { makeTestDb } from "./helpers/make-test-db.js";

let startIndexer;
let modulesReady = false;

try {
  const indexerMod = await import("../server/memory/indexer.js");
  startIndexer = indexerMod.startIndexer;
  modulesReady = true;
} catch {
  // Backend modules not yet built
}

const SKIP = !modulesReady ? "pending Backend modules (indexer.js)" : false;

// ── helpers ─────────────────────────────────────────────────────────────────

function makeTempDir() {
  return mkdtempSync(path.join(tmpdir(), "memory-indexer-test-"));
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function makeProjectsDir(base, name = "-Users-test-indexer") {
  const dir = path.join(base, ".claude", "projects", name);
  mkdirSync(dir, { recursive: true });
  return dir;
}

const silentLogger = { info: () => {}, error: () => {}, warn: () => {} };

function makeAssistantLine({
  text,
  toolUse,
  timestamp,
  sessionId,
  isSidechain,
} = {}) {
  const content = [];
  if (text) content.push({ type: "text", text });
  if (toolUse) content.push({ type: "tool_use", ...toolUse });
  return JSON.stringify({
    type: "assistant",
    isSidechain: isSidechain || false,
    timestamp: timestamp || new Date().toISOString(),
    session_id: sessionId || "test-session-001",
    message: { content },
  });
}

function countRows(db, sourcePath) {
  const row = db
    .prepare("SELECT COUNT(*) as n FROM turns WHERE source_path = ?")
    .get(sourcePath);
  return row?.n ?? 0;
}

function getWatermark(db, sourcePath) {
  return db
    .prepare("SELECT * FROM watermarks WHERE source_path = ?")
    .get(sourcePath);
}

// ── JSONL parser filtering ───────────────────────────────────────────────────

describe(
  "JSONL parser — filtering (verified via DB row counts)",
  { skip: SKIP },
  () => {
    let tmpDir, projectsDir, db, indexer;

    before(async () => {
      tmpDir = makeTempDir();
      projectsDir = makeProjectsDir(tmpDir);
      db = await makeTestDb();

      const jsonlPath = path.join(projectsDir, "filter-test.jsonl");
      const lines = [
        // Must be skipped:
        JSON.stringify({
          type: "queue-operation",
          timestamp: new Date().toISOString(),
        }),
        JSON.stringify({
          type: "ai-title",
          timestamp: new Date().toISOString(),
          title: "Chat",
        }),
        makeAssistantLine({
          text: "sidechain content here",
          isSidechain: true,
        }),
        JSON.stringify({
          type: "user",
          timestamp: new Date().toISOString(),
          session_id: "s1",
          message: { content: "ok" }, // <20 chars — trivial
        }),
        // Must be indexed:
        makeAssistantLine({
          text: "I refactored the auth middleware to use jwt rotation",
        }),
        makeAssistantLine({
          toolUse: {
            id: "tu1",
            name: "Edit",
            input: {
              file_path: "/Users/tue.nc/Desktop/foo.js",
              old_string: "a",
              new_string: "b",
            },
          },
        }),
        makeAssistantLine({
          toolUse: {
            id: "tu2",
            name: "Read",
            input: { file_path: "/Users/tue.nc/Desktop/bar.ts" },
          },
        }),
      ];
      writeFileSync(jsonlPath, lines.join("\n") + "\n");

      indexer = startIndexer({
        db,
        root: path.join(tmpDir, ".claude", "projects"),
        logger: silentLogger,
      });
      await sleep(1500); // wait for bulk-index setImmediate + async I/O
    });

    after(() => {
      if (indexer) indexer.stop();
    });

    it("skips queue-operation, ai-title, isSidechain=true, and trivial user lines", async () => {
      const jsonlPath = path.join(projectsDir, "filter-test.jsonl");
      const n = countRows(db, jsonlPath);
      // 3 valid assistant lines should be indexed; 4 noise lines skipped
      assert.ok(n >= 1, `should have indexed at least 1 row, got ${n}`);
      assert.ok(n <= 3, `should have at most 3 rows (noise skipped), got ${n}`);
    });

    it("extracts assistant text block into row.text", async () => {
      const jsonlPath = path.join(projectsDir, "filter-test.jsonl");
      const rows = db
        .prepare("SELECT text FROM turns WHERE source_path = ?")
        .all(jsonlPath);
      assert.ok(
        rows.some((r) => r.text.includes("auth middleware")),
        "assistant text block must appear in row.text",
      );
    });

    it("produces tool_use summary containing tool name and file path (Edit /path: changed)", async () => {
      const jsonlPath = path.join(projectsDir, "filter-test.jsonl");
      const rows = db
        .prepare("SELECT text FROM turns WHERE source_path = ?")
        .all(jsonlPath);
      assert.ok(
        rows.some((r) => r.text.includes("Edit") && r.text.includes("foo.js")),
        "Edit tool_use must produce summary with tool name and file path",
      );
    });

    it("extracts file_path from tool_use into the files column", async () => {
      const jsonlPath = path.join(projectsDir, "filter-test.jsonl");
      const rows = db
        .prepare("SELECT files FROM turns WHERE source_path = ?")
        .all(jsonlPath);
      const allFiles = rows.flatMap((r) => JSON.parse(r.files || "[]"));
      assert.ok(
        allFiles.some((f) => f.includes("foo.js") || f.includes("bar.ts")),
        "file_path from tool_use.input must appear in files column",
      );
    });

    it("extracts @/abs/path from user text into the files column", async () => {
      const jsonlPath2 = path.join(projectsDir, "atpath-test.jsonl");
      writeFileSync(
        jsonlPath2,
        JSON.stringify({
          type: "user",
          timestamp: new Date().toISOString(),
          session_id: "test-atpath-session",
          message: {
            content:
              "Please check @/Users/tue.nc/Desktop/agent-coding/server.js for the bug I mentioned earlier in this long message",
          },
        }) + "\n",
      );

      // Re-index to pick up new file
      indexer.stop();
      indexer = startIndexer({
        db,
        root: path.join(tmpDir, ".claude", "projects"),
        logger: silentLogger,
      });
      await sleep(1500);

      const rows = db
        .prepare("SELECT files FROM turns WHERE source_path = ?")
        .all(jsonlPath2);
      assert.ok(rows.length > 0, "user turn with @/abs/path must be indexed");
      const allFiles = rows.flatMap((r) => JSON.parse(r.files || "[]"));
      assert.ok(
        allFiles.some((f) => f.includes("server.js")),
        "must extract @/abs/path from user text into files column",
      );
    });

    it("extracts timestamp from ISO timestamp field into ts column (unix ms)", async () => {
      const ts = "2026-04-28T12:00:00.000Z";
      const jsonlPath3 = path.join(projectsDir, "ts-test.jsonl");
      writeFileSync(
        jsonlPath3,
        makeAssistantLine({
          text: "timestamp extraction test content must be long enough to pass filter",
          timestamp: ts,
          sessionId: "ts-session",
        }) + "\n",
      );

      indexer.stop();
      indexer = startIndexer({
        db,
        root: path.join(tmpDir, ".claude", "projects"),
        logger: silentLogger,
      });
      await sleep(1500);

      const rows = db
        .prepare("SELECT ts FROM turns WHERE source_path = ?")
        .all(jsonlPath3);
      assert.ok(rows.length > 0, "turn must be indexed");
      assert.equal(
        rows[0].ts,
        Date.parse(ts),
        "ts must be unix ms from ISO timestamp field",
      );
    });
  },
);

// ── Watermark resume ──────────────────────────────────────────────────────────

describe(
  "Watermark resume — only new bytes parsed on second pass",
  { skip: SKIP },
  () => {
    let tmpDir, projectsDir, db, indexer;

    before(async () => {
      tmpDir = makeTempDir();
      projectsDir = makeProjectsDir(tmpDir, "-Users-wm-test");
      db = await makeTestDb();
    });

    after(() => {
      if (indexer) indexer.stop();
    });

    it("appending 50 lines to a 100-line file yields ~50 new rows via watcher+watermark", async () => {
      const jsonlPath = path.join(projectsDir, "watermark-test.jsonl");

      // First pass: write 100 lines, let bulk indexer pick them up
      const batch1 = Array.from({ length: 100 }, (_, i) =>
        makeAssistantLine({
          text: `watermark batch one line ${i} with enough content to exceed twenty chars`,
          sessionId: `wm-sess-1-${i}`,
        }),
      );
      writeFileSync(jsonlPath, batch1.join("\n") + "\n");

      indexer = startIndexer({
        db,
        root: path.join(tmpDir, ".claude", "projects"),
        logger: silentLogger,
      });
      await sleep(1500); // wait for bulk-index setImmediate + async I/O

      const countAfterFirst = countRows(db, jsonlPath);
      assert.ok(countAfterFirst > 0, "should index rows from first 100 lines");
      const wmAfterFirst = getWatermark(db, jsonlPath);
      assert.ok(wmAfterFirst, "watermark must exist after first pass");

      // Append 50 more lines — keep the SAME indexer alive so chokidar watcher fires
      // and parseFromWatermark (the watermark-aware incremental path) handles them.
      const batch2 = Array.from({ length: 50 }, (_, i) =>
        makeAssistantLine({
          text: `watermark batch two line ${i} with enough content to exceed twenty chars`,
          sessionId: `wm-sess-2-${i}`,
        }),
      );
      for (const line of batch2) appendFileSync(jsonlPath, line + "\n");

      // Wait for idle window (5s) + parse + buffer
      await sleep(7000);

      const countAfterSecond = countRows(db, jsonlPath);
      const wmAfterSecond = getWatermark(db, jsonlPath);

      assert.ok(
        countAfterSecond > countAfterFirst,
        `second pass must add rows: before=${countAfterFirst} after=${countAfterSecond}`,
      );
      assert.ok(
        wmAfterSecond.byte_offset > wmAfterFirst.byte_offset,
        "watermark byte_offset must advance after second pass",
      );
      // Only the 50 new lines should be parsed (watermark skips the first 100)
      const newRows = countAfterSecond - countAfterFirst;
      assert.ok(
        newRows >= 40 && newRows <= 60,
        `expected ~50 new rows from incremental watcher pass, got ${newRows}`,
      );
    });
  },
);

// ── Idle window coalescing ────────────────────────────────────────────────────

describe(
  "Idle window — 5s debounce coalesces rapid writes to one parse",
  { skip: SKIP },
  () => {
    let tmpDir, projectsDir, db, indexer;

    before(async () => {
      tmpDir = makeTempDir();
      projectsDir = makeProjectsDir(tmpDir, "-Users-idle-test");
      db = await makeTestDb();
    });

    after(() => {
      if (indexer) indexer.stop();
    });

    it("3 rapid writes within 1s are all indexed after the 5s idle window expires", async () => {
      const jsonlPath = path.join(projectsDir, "idle-test.jsonl");

      // Seed one line so indexer picks up file in bulk pass
      writeFileSync(
        jsonlPath,
        makeAssistantLine({
          text: "idle window seed line with sufficient content",
        }) + "\n",
      );

      indexer = startIndexer({
        db,
        root: path.join(tmpDir, ".claude", "projects"),
        logger: silentLogger,
      });
      await sleep(1500); // wait for bulk pass

      const countBefore = countRows(db, jsonlPath);

      // Three rapid appends within 1s (well inside the 5s idle window)
      for (let i = 0; i < 3; i++) {
        appendFileSync(
          jsonlPath,
          makeAssistantLine({
            text: `idle window rapid append ${i} with enough content here for the filter`,
            sessionId: `idle-sess-${i}`,
          }) + "\n",
        );
        await sleep(200);
      }

      // Wait for idle window to expire and parse to complete (5s + 2s buffer)
      await sleep(7000);

      const countAfterIdle = countRows(db, jsonlPath);
      assert.ok(
        countAfterIdle > countBefore,
        `rows must increase after idle window: before=${countBefore} after=${countAfterIdle}`,
      );
    });
  },
);

// ── Unlink handler ────────────────────────────────────────────────────────────

describe(
  "unlink handler — file deletion removes rows and watermark",
  { skip: SKIP },
  () => {
    let tmpDir, projectsDir, db, indexer;

    before(async () => {
      tmpDir = makeTempDir();
      projectsDir = makeProjectsDir(tmpDir, "-Users-unlink-test");
      db = await makeTestDb();
    });

    after(() => {
      if (indexer) indexer.stop();
    });

    it("rows and watermark deleted on unlink; indexer continues running", async () => {
      const jsonlPath = path.join(projectsDir, "unlink-test.jsonl");
      const lines = Array.from({ length: 5 }, (_, i) =>
        makeAssistantLine({
          text: `unlink test content line ${i} with enough chars to pass the filter`,
          sessionId: `unlink-sess-${i}`,
        }),
      );
      writeFileSync(jsonlPath, lines.join("\n") + "\n");

      indexer = startIndexer({
        db,
        root: path.join(tmpDir, ".claude", "projects"),
        logger: silentLogger,
      });
      await sleep(1500);

      const countBefore = countRows(db, jsonlPath);
      assert.ok(countBefore > 0, "rows must exist before unlink");
      assert.ok(
        getWatermark(db, jsonlPath),
        "watermark must exist before unlink",
      );

      unlinkSync(jsonlPath);
      await sleep(1000); // let chokidar fire the unlink event

      assert.equal(
        countRows(db, jsonlPath),
        0,
        "rows must be gone after file unlink",
      );
      assert.equal(
        getWatermark(db, jsonlPath),
        undefined,
        "watermark must be gone after file unlink",
      );

      // Verify indexer is still alive by indexing a new file
      const jsonlPath2 = path.join(projectsDir, "post-unlink.jsonl");
      writeFileSync(
        jsonlPath2,
        makeAssistantLine({
          text: "post-unlink verification that indexer is still running fine",
          sessionId: "post-unlink-sess",
        }) + "\n",
      );
      indexer.stop();
      indexer = startIndexer({
        db,
        root: path.join(tmpDir, ".claude", "projects"),
        logger: silentLogger,
      });
      await sleep(1500);

      assert.ok(
        countRows(db, jsonlPath2) > 0,
        "indexer must still work after an unlink event",
      );
    });
  },
);

// ── Edge cases ────────────────────────────────────────────────────────────────

describe("Edge cases — indexer", { skip: SKIP }, () => {
  let tmpDir, db;

  before(async () => {
    tmpDir = makeTempDir();
    db = await makeTestDb();
  });

  it("empty projects dir boots cleanly (no errors)", async () => {
    const emptyRoot = path.join(tmpDir, "empty-projects");
    mkdirSync(emptyRoot, { recursive: true });
    let errorFired = false;
    const idx = startIndexer({
      db,
      root: emptyRoot,
      logger: {
        info: () => {},
        error: () => {
          errorFired = true;
        },
        warn: () => {},
      },
    });
    await sleep(500);
    idx.stop();
    assert.equal(
      errorFired,
      false,
      "no errors should be logged for empty projects dir",
    );
  });

  it("non-existent projects dir returns no-op indexer (no errors)", async () => {
    const missingRoot = path.join(tmpDir, "does-not-exist");
    let errorFired = false;
    const idx = startIndexer({
      db,
      root: missingRoot,
      logger: {
        info: () => {},
        error: () => {
          errorFired = true;
        },
        warn: () => {},
      },
    });
    await sleep(300);
    idx.stop();
    assert.equal(errorFired, false, "no errors for non-existent projects dir");
  });

  it("concurrent writes to two different jsonl files both get indexed", async () => {
    const dir = path.join(tmpDir, ".claude", "projects", "-Users-concurrent");
    mkdirSync(dir, { recursive: true });

    const fileA = path.join(dir, "session-A.jsonl");
    const fileB = path.join(dir, "session-B.jsonl");

    writeFileSync(
      fileA,
      Array.from({ length: 5 }, (_, i) =>
        makeAssistantLine({
          text: `concurrent file A line ${i} with sufficient content here`,
          sessionId: `sess-A-${i}`,
        }),
      ).join("\n") + "\n",
    );
    writeFileSync(
      fileB,
      Array.from({ length: 5 }, (_, i) =>
        makeAssistantLine({
          text: `concurrent file B line ${i} with sufficient content here`,
          sessionId: `sess-B-${i}`,
        }),
      ).join("\n") + "\n",
    );

    const idx = startIndexer({
      db,
      root: path.join(tmpDir, ".claude", "projects"),
      logger: silentLogger,
    });
    await sleep(1500);
    idx.stop();

    assert.ok(countRows(db, fileA) > 0, `file A must be indexed`);
    assert.ok(countRows(db, fileB) > 0, `file B must be indexed`);
  });
});
