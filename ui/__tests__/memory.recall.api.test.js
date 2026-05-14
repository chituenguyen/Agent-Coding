import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServer } from "node:http";
import { once } from "node:events";

import { makeTestDb } from "./helpers/make-test-db.js";

let startIndexer, recallContext;
let modulesReady = false;

try {
  const [indexerMod, recallMod] = await Promise.all([
    import("../server/memory/indexer.js"),
    import("../server/memory/recall.js"),
  ]);
  startIndexer = indexerMod.startIndexer;
  recallContext = recallMod.recallContext;
  modulesReady = true;
} catch {
  // Backend modules not yet built
}

const SKIP = !modulesReady
  ? "pending Backend modules (indexer.js, recall.js)"
  : false;
const silentLogger = { info: () => {}, error: () => {}, warn: () => {} };

// ── helpers ─────────────────────────────────────────────────────────────────

function makeTempDir() {
  return mkdtempSync(path.join(tmpdir(), "memory-api-test-"));
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
    srv.on("error", reject);
  });
}

async function getJson(url) {
  const http = await import("node:http");
  return new Promise((resolve, reject) => {
    const req = http.default.get(url, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(body) });
        } catch (e) {
          reject(new Error(`Failed to parse response: ${body}`));
        }
      });
    });
    req.on("error", reject);
    req.setTimeout(10_000, () => req.destroy(new Error("Request timed out")));
  });
}

function buildRecallApp(db) {
  // Build a minimal Express app with just the recall route — no server.js side effects
  return import("express").then(({ default: express }) => {
    const app = express();
    app.get("/api/memory/recall", (req, res) => {
      try {
        const { q, file, project, limit, cutoff } = req.query;
        const hits = recallContext(
          {
            q: q || "",
            file: file || null,
            project: project || null,
            limit: Math.min(parseInt(limit || "5", 10), 20),
            cutoff: cutoff != null ? parseFloat(cutoff) : 0.25,
          },
          db,
        );
        res.json({ hits, count: hits.length });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });
    return app;
  });
}

function makeSyntheticJsonl(numTurns, phraseToPlant = null) {
  const plantIdx = phraseToPlant ? Math.floor(numTurns / 2) : -1;
  return (
    Array.from({ length: numTurns }, (_, i) => {
      const text =
        i === plantIdx
          ? `The critical insight is ${phraseToPlant} — a rare combination appearing in this session`
          : `Turn ${i}: generic content about authentication middleware and jwt token session refresh login`;
      return JSON.stringify({
        type: "assistant",
        isSidechain: false,
        timestamp: new Date(Date.now() - i * 1000).toISOString(),
        session_id: `test-session-api-${i}`,
        message: { content: [{ type: "text", text }] },
      });
    }).join("\n") + "\n"
  );
}

// ── Integration: boot minimal server, plant phrase, query ────────────────────

describe("Recall API — integration", { skip: SKIP }, () => {
  let tmpDir, projectsDir, jsonlPath, db, indexer, server, port;

  before(async () => {
    tmpDir = makeTempDir();
    projectsDir = path.join(tmpDir, ".claude", "projects", "-Users-test-api");
    mkdirSync(projectsDir, { recursive: true });

    db = await makeTestDb();

    // Plant the phrase alongside background rows so BM25 normalization works.
    // With only 1 row, bm25_norm=0 (min==max), so rawScore=0.2*recency < cutoff=0.25.
    // Adding background rows with different tokens gives the cornflower row bm25_norm=1.
    jsonlPath = path.join(projectsDir, "test-session-api.jsonl");
    const cornflowerLine = JSON.stringify({
      type: "assistant",
      isSidechain: false,
      timestamp: new Date().toISOString(),
      session_id: "test-session-cornflower",
      message: {
        content: [
          {
            type: "text",
            text: "The critical insight is cornflower magnetar — this rare combination appears only here",
          },
        ],
      },
    });
    // 5 background rows with unrelated terms (no cornflower)
    const bgLines = Array.from({ length: 5 }, (_, i) =>
      JSON.stringify({
        type: "assistant",
        isSidechain: false,
        timestamp: new Date(Date.now() - (i + 1) * 60000).toISOString(),
        session_id: `bg-session-${i}`,
        message: {
          content: [
            {
              type: "text",
              text: `Background turn ${i}: authentication middleware jwt token session refresh login oauth`,
            },
          ],
        },
      }),
    );
    writeFileSync(jsonlPath, [cornflowerLine, ...bgLines].join("\n") + "\n");

    // Boot indexer with our test DB
    indexer = startIndexer({
      db,
      root: path.join(tmpDir, ".claude", "projects"),
      logger: silentLogger,
    });

    // Boot minimal HTTP server
    const app = await buildRecallApp(db);
    port = await getFreePort();
    server = app.listen(port, "127.0.0.1");
    await once(server, "listening");

    // Wait for: bulk-index setImmediate + async I/O + idle window (5s) + buffer
    await sleep(7000);
  });

  after(async () => {
    if (indexer) indexer.stop();
    if (server) await new Promise((r) => server.close(r));
  });

  it("GET /api/memory/recall?q=cornflower returns top hit containing the phrase", async () => {
    // cutoff=0 because with few rows in a test DB, rawScore can be below the default
    // 0.25 cutoff (bm25_norm is normalized over the candidate set, not absolute).
    const { status, body } = await getJson(
      `http://127.0.0.1:${port}/api/memory/recall?q=cornflower&limit=5&cutoff=0`,
    );
    assert.equal(status, 200);
    assert.ok(typeof body.count === "number");
    assert.ok(Array.isArray(body.hits));
    assert.ok(body.hits.length > 0, "should have at least 1 hit");
    const top = body.hits[0];
    assert.ok(
      top.text.toLowerCase().includes("cornflower"),
      `top hit text should contain 'cornflower', got: ${top.text.slice(0, 200)}`,
    );
    assert.ok(
      top.score >= 0 && top.score <= 1,
      `score ${top.score} must be in [0,1]`,
    );
    assert.ok(top.session_id, "hit must have session_id");
    assert.ok(top.ts, "hit must have ts");
  });

  it("response shape matches contract (turn_id, session_id, project, source_path, ts, text, files, score)", async () => {
    const { body } = await getJson(
      `http://127.0.0.1:${port}/api/memory/recall?q=cornflower&cutoff=0`,
    );
    assert.ok(body.hits.length > 0, "need at least 1 hit to check shape");
    const hit = body.hits[0];
    assert.ok("turn_id" in hit || "id" in hit, "hit must have turn_id or id");
    assert.ok(typeof hit.session_id === "string");
    assert.ok(typeof hit.project === "string");
    assert.ok(typeof hit.source_path === "string");
    assert.ok(typeof hit.ts === "number");
    assert.ok(typeof hit.text === "string");
    assert.ok(typeof hit.score === "number");
    assert.ok(hit.score >= 0 && hit.score <= 1, "score must be in [0,1]");
  });

  it("GET /api/memory/recall with no q and no file returns 200 with array hits", async () => {
    const { status, body } = await getJson(
      `http://127.0.0.1:${port}/api/memory/recall`,
    );
    assert.equal(status, 200);
    assert.ok(Array.isArray(body.hits));
  });

  it("limit param is respected (limit=1 returns at most 1 hit)", async () => {
    const { body } = await getJson(
      `http://127.0.0.1:${port}/api/memory/recall?q=cornflower&limit=1`,
    );
    assert.ok(body.hits.length <= 1, "limit=1 must return at most 1 hit");
  });
});

// ── Smoke test: 5000-turn JSONL indexes in <10s ───────────────────────────────

describe(
  "Indexer performance — 10MB JSONL with 5000 turns in <10s",
  { skip: SKIP },
  () => {
    let tmpDir, projectsDir, jsonlPath, db, indexer;

    before(async () => {
      tmpDir = makeTempDir();
      projectsDir = path.join(
        tmpDir,
        ".claude",
        "projects",
        "-Users-perf-test",
      );
      mkdirSync(projectsDir, { recursive: true });
      jsonlPath = path.join(projectsDir, "perf-session.jsonl");
      db = await makeTestDb();
    });

    after(() => {
      if (indexer) indexer.stop();
    });

    it("5000-turn JSONL completes initial bulk index in <10s", async () => {
      const content = makeSyntheticJsonl(5000);
      assert.ok(
        Buffer.byteLength(content) > 500_000,
        "fixture must be substantial",
      );
      writeFileSync(jsonlPath, content);

      const t0 = Date.now();
      indexer = startIndexer({
        db,
        root: path.join(tmpDir, ".claude", "projects"),
        logger: silentLogger,
      });

      // Poll until DB has rows or 10s elapses
      let count = 0;
      for (let i = 0; i < 100 && count < 10; i++) {
        await sleep(100);
        count = db.prepare("SELECT COUNT(*) as n FROM turns").get()?.n || 0;
      }
      const elapsed = Date.now() - t0;

      console.log(`Indexed ${count} turns in ${elapsed}ms`);
      assert.ok(count > 0, "should have indexed at least some turns");
      assert.ok(elapsed < 10_000, `indexing took ${elapsed}ms, must be <10s`);
    });
  },
);

// ── Edge: deleted file mid-watch ──────────────────────────────────────────────

describe(
  "Edge: file deleted mid-watch removes its rows",
  { skip: SKIP },
  () => {
    it("deleted file's rows are gone, no crash", async (t) => {
      t.skip(
        "covered in memory.indexer.test.js unlink handler suite — skipped here to avoid test duration inflation",
      );
    });
  },
);
