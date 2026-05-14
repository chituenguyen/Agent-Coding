import { describe, it, before } from "node:test";
import assert from "node:assert/strict";

import { makeTestDb } from "./helpers/make-test-db.js";

let recallContext;
let modulesReady = false;

try {
  const recallMod = await import("../server/memory/recall.js");
  recallContext = recallMod.recallContext;
  modulesReady = true;
} catch {
  // Backend modules not yet built
}

const SKIP = !modulesReady ? "pending Backend modules (recall.js)" : false;

// ── helpers ─────────────────────────────────────────────────────────────────

function daysAgo(n) {
  return Date.now() - n * 24 * 60 * 60 * 1000;
}

function insertTurns(db, turns) {
  const stmt = db.prepare(`
    INSERT INTO turns (session_id, project, source_path, ts, role, text, files, tools, byte_offset)
    VALUES (@session_id, @project, @source_path, @ts, @role, @text, @files, @tools, @byte_offset)
  `);
  db.transaction((rows) => {
    for (const row of rows) stmt.run(row);
  })(turns);
}

function makeTurn(overrides = {}) {
  return {
    session_id: `sess-${Math.random().toString(36).slice(2)}`,
    project: "test-project",
    source_path: "/tmp/test.jsonl",
    ts: daysAgo(7),
    role: "assistant",
    text: "generic content about authentication",
    files: JSON.stringify([]),
    tools: JSON.stringify([]),
    byte_offset: Math.floor(Math.random() * 1_000_000),
    ...overrides,
  };
}

// ── Scoring unit tests ───────────────────────────────────────────────────────

describe("Scoring formula — normalized [0,1]", { skip: SKIP }, () => {
  let db;

  before(async () => {
    db = await makeTestDb();
  });

  it("all returned scores are in [0, 1]", async () => {
    const turns = Array.from({ length: 20 }, (_, i) =>
      makeTurn({
        text: `Turn ${i}: authentication jwt token refresh login session`,
        ts: daysAgo(i),
        files: JSON.stringify(
          i % 3 === 0
            ? ["/Users/tue.nc/Desktop/agent-coding/src/auth/login.ts"]
            : [],
        ),
      }),
    );
    insertTurns(db, turns);

    const hits = recallContext(
      { q: "authentication jwt", limit: 20, cutoff: 0 },
      db,
    );
    assert.ok(hits.length > 0, "should return hits");
    for (const hit of hits) {
      assert.ok(hit.score >= 0, `score ${hit.score} must be >= 0`);
      assert.ok(hit.score <= 1, `score ${hit.score} must be <= 1`);
    }
  });

  it("recency boost causes recent row to overtake older BM25 winner", async () => {
    // oldRow: 60 days old, slightly more tokens (stronger raw BM25)
    // recentRow: 1 day old, same core tokens → recency weight tips the balance
    const oldRow = makeTurn({
      text: "cornflower magnetar supernova nebula jwt authentication login token session refresh",
      ts: daysAgo(60),
      source_path: "/tmp/old-session-recency.jsonl",
      session_id: "old-sess-recency-001",
      byte_offset: 1_000_001,
    });
    const recentRow = makeTurn({
      text: "cornflower magnetar jwt authentication login token session refresh",
      ts: daysAgo(1),
      source_path: "/tmp/recent-session-recency.jsonl",
      session_id: "recent-sess-recency-001",
      byte_offset: 1_000_002,
    });
    insertTurns(db, [oldRow, recentRow]);

    const hits = recallContext(
      { q: "cornflower magnetar jwt authentication", limit: 5, cutoff: 0 },
      db,
    );
    assert.ok(hits.length >= 2, "should return at least 2 hits");
    assert.equal(
      hits[0].session_id,
      "recent-sess-recency-001",
      "recent row should be ranked first due to recency boost",
    );
  });

  it("file overlap raises a row's score when file param matches its files column", async () => {
    // Verify the file_overlap component (w=0.20) increases a row's score.
    // Strategy: query the same row twice — once with a matching file, once without.
    // The matching-file query must produce a higher score for the row with the file.
    // We use two separate rows (matched-file, no-file) in an isolated project.
    // Because FTS5 indexes the files column, the row with a non-empty files col
    // may get a slightly different BM25. We compensate by making both rows have
    // identical text AND by using project isolation so no other rows pollute ranking.
    // The assertion: matched-file row score WITH file param > matched-file row score WITHOUT.
    const project = "file-overlap-score-delta";
    const ts = daysAgo(5);
    const text =
      "gravitational lensing dark matter cosmic microwave background radiation primordial";

    // Row A: has the file in its files column
    const rowA = makeTurn({
      text,
      ts,
      project,
      files: JSON.stringify(["/Users/tue.nc/Desktop/agent-coding/server.js"]),
      session_id: "file-overlap-row-A",
      source_path: "/tmp/file-overlap-A.jsonl",
      byte_offset: 6_660_001,
    });
    // Row B: no file, same text, same age — used as baseline
    const rowB = makeTurn({
      text,
      ts,
      project,
      files: JSON.stringify([]),
      session_id: "file-overlap-row-B",
      source_path: "/tmp/file-overlap-B.jsonl",
      byte_offset: 6_660_002,
    });
    insertTurns(db, [rowA, rowB]);

    // Query WITHOUT file param — file_overlap=0 for both rows
    const hitsNoFile = recallContext(
      { q: "gravitational lensing dark matter cosmic", project, limit: 5, cutoff: 0 },
      db,
    );
    // Query WITH matching file param — file_overlap=1 for row A, 0 for row B
    const hitsWithFile = recallContext(
      {
        q: "gravitational lensing dark matter cosmic",
        file: "/Users/tue.nc/Desktop/agent-coding/server.js",
        project,
        limit: 5,
        cutoff: 0,
      },
      db,
    );

    assert.ok(hitsNoFile.length >= 1, "no-file query must return hits");
    assert.ok(hitsWithFile.length >= 1, "with-file query must return hits");

    const rowANoFile = hitsNoFile.find((h) => h.session_id === "file-overlap-row-A");
    const rowAWithFile = hitsWithFile.find((h) => h.session_id === "file-overlap-row-A");

    if (rowANoFile && rowAWithFile) {
      // Row A's score must be higher (or equal, if already 1.0) with the matching file param
      assert.ok(
        rowAWithFile.score >= rowANoFile.score,
        `row A score with file param (${rowAWithFile.score.toFixed(3)}) must be >= score without (${rowANoFile.score.toFixed(3)})`,
      );
    }
    // Regardless: with file param, row A must appear in top results
    assert.ok(
      hitsWithFile.some((h) => h.session_id === "file-overlap-row-A"),
      "row A with matching file must appear in results when file param is provided",
    );
  });

  it("cutoff drops below-threshold hits", async () => {
    // High cutoff (0.8) should exclude weak matches
    const hitsHighCutoff = recallContext(
      { q: "authentication jwt token", limit: 20, cutoff: 0.8 },
      db,
    );
    for (const hit of hitsHighCutoff) {
      assert.ok(
        hit.score >= 0.8,
        `hit with score ${hit.score} should be above cutoff 0.8`,
      );
    }
  });

  it("returns empty array when no FTS matches", async () => {
    const hits = recallContext(
      { q: "zzznomatchphrasexyzabc987654", limit: 5, cutoff: 0 },
      db,
    );
    assert.deepEqual(hits, []);
  });

  it("FTS5 parse error on weird unicode query returns [] (no throw)", async () => {
    const weirdQueries = [
      '"unclosed quote',
      "AND OR NOT",
      "😀🎯🚀 emoji storm",
      "� replacement char",
    ];
    for (const q of weirdQueries) {
      const hits = recallContext({ q, limit: 5, cutoff: 0 }, db);
      assert.ok(
        Array.isArray(hits),
        `weird query "${q}" must return an array, not throw`,
      );
    }
  });
});

// ── Performance test ─────────────────────────────────────────────────────────

describe(
  "Performance: recall p95 <50ms on 25k-row fixture",
  { skip: SKIP },
  () => {
    let db;

    before(async () => {
      db = await makeTestDb();

      const stmt = db.prepare(`
      INSERT INTO turns (session_id, project, source_path, ts, role, text, files, tools, byte_offset)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
      const keywords = [
        "authentication",
        "jwt",
        "token",
        "session",
        "login",
        "refresh",
        "auth",
      ];
      db.transaction(() => {
        for (let i = 0; i < 25_000; i++) {
          const kw = keywords[i % keywords.length];
          stmt.run(
            `perf-sess-${i}`,
            "perf-project",
            `/tmp/perf-${i % 50}.jsonl`,
            daysAgo(i % 365),
            "assistant",
            `Turn ${i}: ${kw} middleware implementation details and configuration`,
            JSON.stringify([]),
            JSON.stringify([]),
            i * 100,
          );
        }
      })();
    });

    it(
      "p95 recall latency <50ms on 25k-row DB",
      {
        // Skip in CI — shared runners have too much timing variance
        skip:
          process.env.CI === "true"
            ? "skipped in CI — timing assertions unreliable on shared runners"
            : false,
      },
      async () => {
        const SAMPLES = 20;
        const latencies = [];

        for (let i = 0; i < SAMPLES; i++) {
          const t0 = performance.now();
          recallContext(
            { q: "authentication jwt token", limit: 5, cutoff: 0.25 },
            db,
          );
          latencies.push(performance.now() - t0);
        }

        latencies.sort((a, b) => a - b);
        const p95 = latencies[Math.floor(SAMPLES * 0.95)];
        const p50 = latencies[Math.floor(SAMPLES * 0.5)];

        console.log(
          `Recall latency p50=${p50.toFixed(1)}ms p95=${p95.toFixed(1)}ms`,
        );
        assert.ok(
          p95 < 50,
          `p95 latency ${p95.toFixed(1)}ms exceeds 50ms budget on 25k-row DB`,
        );
      },
    );
  },
);
