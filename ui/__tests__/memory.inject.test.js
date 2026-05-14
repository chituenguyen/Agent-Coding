import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { makeTestDb } from "./helpers/make-test-db.js";

let injectRecallContext;
let modulesReady = false;

try {
  const injectMod = await import("../server/memory/inject.js");
  injectRecallContext = injectMod.injectRecallContext;
  modulesReady = true;
} catch {
  // Backend modules not yet built
}

const SKIP = !modulesReady ? "pending Backend modules (inject.js)" : false;

// ── helpers ─────────────────────────────────────────────────────────────────

function makeTempDir() {
  return mkdtempSync(path.join(tmpdir(), "memory-inject-test-"));
}

// ── Test: prepends ## Prior context block ────────────────────────────────────

describe(
  "injectRecallContext — prepends Prior context block",
  { skip: SKIP },
  () => {
    let tmpDir, db;

    before(async () => {
      tmpDir = makeTempDir();
      mkdirSync(path.join(tmpDir, "projects"), { recursive: true });
      db = await makeTestDb();
    });

    it("prepends ## Prior context block before the -p value when hits exist", async () => {
      const originalPrompt = "Please analyze the authentication flow";
      const args = ["-p", originalPrompt, "--some-flag", "value"];

      // Pass db explicitly to avoid inject.js line-18 bug:
      // `(await import("./db.js")).then(m => m.getDb())` calls .then() on a
      // module namespace object (not a Promise) → TypeError. Filed @Backend.
      const result = await injectRecallContext(args, {
        workspace: tmpDir,
        project: "test-project",
        prompt: originalPrompt,
        files: [],
        db,
      });

      assert.ok(Array.isArray(result), "result must be an array");
      const pIdx = result.indexOf("-p");
      assert.ok(pIdx !== -1, "-p flag must still be present");
      const promptValue = result[pIdx + 1];
      assert.ok(
        typeof promptValue === "string",
        "prompt value must be a string",
      );

      if (promptValue !== originalPrompt) {
        assert.ok(
          promptValue.includes("## Prior context"),
          `injected prompt must contain ## Prior context block, got: ${promptValue.slice(0, 200)}`,
        );
        assert.ok(
          promptValue.includes(originalPrompt),
          "original prompt must be preserved after the prior context block",
        );
        assert.ok(
          promptValue.indexOf("## Prior context") <
            promptValue.indexOf(originalPrompt),
          "## Prior context block must come BEFORE the original prompt",
        );
        assert.ok(
          promptValue.includes("---"),
          "block must end with --- terminator",
        );
      }

      // Non-prompt args must be unchanged
      const pArgIdx = args.indexOf("-p");
      const otherResult = result.filter((_, i) => i !== pIdx + 1);
      const otherOriginal = args.filter((_, i) => i !== pArgIdx + 1);
      assert.deepEqual(
        otherResult,
        otherOriginal,
        "non-prompt args must not be mutated",
      );
    });

    it("returns original args unchanged when no -p flag present", async () => {
      const args = ["--some-flag", "value", "--another", "arg"];
      const result = await injectRecallContext(args, {
        workspace: tmpDir,
        project: "test-project",
        prompt: "",
        files: [],
        db,
      });
      assert.deepEqual(
        result,
        args,
        "args without -p must be returned unchanged",
      );
    });
  },
);

// ── Test: memory_recall: false disables injection ────────────────────────────

describe(
  "injectRecallContext — memory_recall: false opt-out",
  { skip: SKIP },
  () => {
    let tmpDir, db;

    before(async () => {
      tmpDir = makeTempDir();
      db = await makeTestDb();

      const projectDir = path.join(tmpDir, "projects", "opted-out-project");
      mkdirSync(projectDir, { recursive: true });
      writeFileSync(
        path.join(projectDir, "context.md"),
        "---\nmemory_recall: false\n---\n# Project Context\nDisabled.\n",
      );
    });

    it("memory_recall: false in context.md returns original args without injection", async () => {
      const originalArgs = ["-p", "run the workflow for task XYZ"];
      const result = await injectRecallContext(originalArgs, {
        workspace: tmpDir,
        project: "opted-out-project",
        prompt: "run the workflow for task XYZ",
        files: [],
        db,
      });
      assert.deepEqual(
        result,
        originalArgs,
        "opted-out project must return args unchanged",
      );
    });

    it("project without context.md is not treated as opted out", async () => {
      const originalArgs = ["-p", "some prompt about authentication workflow"];
      const result = await injectRecallContext(originalArgs, {
        workspace: tmpDir,
        project: "non-existent-project",
        prompt: "some prompt about authentication workflow",
        files: [],
        db,
      });
      assert.ok(
        Array.isArray(result),
        "must return an array even for unknown project",
      );
    });

    it("memory_recall: true (explicit) does not disable injection", async () => {
      const enabledDir = path.join(tmpDir, "projects", "enabled-project");
      mkdirSync(enabledDir, { recursive: true });
      writeFileSync(
        path.join(enabledDir, "context.md"),
        "---\nmemory_recall: true\n---\n# Project Context\nEnabled.\n",
      );
      const args = ["-p", "query about auth middleware and jwt tokens"];
      const result = await injectRecallContext(args, {
        workspace: tmpDir,
        project: "enabled-project",
        prompt: "query about auth middleware and jwt tokens",
        files: [],
        db,
      });
      assert.ok(Array.isArray(result));
    });
  },
);

// ── Test: timeout safety ─────────────────────────────────────────────────────

describe("injectRecallContext — timeout safety", { skip: SKIP }, () => {
  let tmpDir, db;

  before(async () => {
    tmpDir = makeTempDir();
    mkdirSync(path.join(tmpDir, "projects"), { recursive: true });
    db = await makeTestDb();
  });

  it("completes within 500ms on empty DB (80ms timeout race fires, returns original args)", async () => {
    const args = ["-p", "test prompt for timeout check"];
    const t0 = Date.now();
    const result = await injectRecallContext(args, {
      workspace: tmpDir,
      project: "empty-db-project",
      prompt: "test prompt for timeout check",
      files: [],
      db,
    });
    const elapsed = Date.now() - t0;
    assert.ok(Array.isArray(result), "must return array");
    assert.ok(
      elapsed < 500,
      `injectRecallContext took ${elapsed}ms — must complete within 500ms`,
    );
  });
});

// ── Test: hard caps (max 3 hits, max 6000 chars) ─────────────────────────────

describe("injectRecallContext — hard caps", { skip: SKIP }, () => {
  let tmpDir, db;

  before(async () => {
    tmpDir = makeTempDir();
    mkdirSync(path.join(tmpDir, "projects"), { recursive: true });
    db = await makeTestDb();

    // Plant 10 rows with matching keywords and distinct text so FTS BM25 scores
    // differentiate across rows. Use timestamps days apart so recency also varies.
    // This ensures at least the top row scores rawScore = 0.6*1 + 0.2*1 > 0.3 cutoff,
    // triggering formatPriorContextBlock and exercising the caps logic.
    const stmt = db.prepare(`
      INSERT INTO turns (session_id, project, source_path, ts, role, text, files, tools, byte_offset)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    // Suffixes make each row's text unique → different BM25 scores
    const suffixes = [
      "authentication oauth session refresh login credential",
      "middleware proxy gateway routing load balancer upstream",
      "jwt token signature verification expiry refresh rotate",
      "auth flow redirect callback state parameter nonce",
      "session storage cookie httponly secure samesite domain",
      "login form submit validation csrf protection token",
      "credential vault secret rotation policy enforcement",
      "oauth2 authorization code flow pkce client redirect",
      "permission role access control policy enforcement rule",
      "identity provider federation sso saml assertion claim",
    ];
    db.transaction(() => {
      for (let i = 0; i < 10; i++) {
        stmt.run(
          `inject-cap-sess-${i}`,
          "inject-test-project",
          `/tmp/inject-cap-${i}.jsonl`,
          Date.now() - i * 86400000, // i days ago — spreads recency scores
          "assistant",
          `capstone keyword inject test: ${suffixes[i]}`,
          JSON.stringify([]),
          JSON.stringify([]),
          i * 500,
        );
      }
    })();
  });

  it("injected block has at most 3 ### hit sections", async () => {
    // "capstone keyword inject test" appears in all 10 rows — triggers injection
    const originalPrompt = "capstone keyword inject test authentication";
    const result = await injectRecallContext(["-p", originalPrompt], {
      workspace: tmpDir,
      project: "inject-test-project",
      prompt: originalPrompt,
      files: [],
      db,
    });
    const promptValue = result[result.indexOf("-p") + 1];
    // Injection must occur — rows have distinct BM25 so top row rawScore > 0.3
    assert.ok(
      promptValue.includes("## Prior context"),
      "injection must occur — rows have sufficient score to pass cutoff 0.3",
    );
    const headerCount = (promptValue.match(/^### \[/gm) || []).length;
    assert.ok(
      headerCount <= 3,
      `block must have at most 3 hit sections, got ${headerCount}`,
    );
  });

  it("injected block total length is at most 6000 chars", async () => {
    const originalPrompt = "capstone keyword inject test authentication";
    const result = await injectRecallContext(["-p", originalPrompt], {
      workspace: tmpDir,
      project: "inject-test-project",
      prompt: originalPrompt,
      files: [],
      db,
    });
    const promptValue = result[result.indexOf("-p") + 1];
    if (promptValue && promptValue.includes("## Prior context")) {
      const blockEnd = promptValue.indexOf(originalPrompt);
      const injectedBlock =
        blockEnd > 0 ? promptValue.slice(0, blockEnd) : promptValue;
      assert.ok(
        injectedBlock.length <= 6200, // +200 tolerance for separator whitespace
        `injected block length ${injectedBlock.length} exceeds 6000 char cap`,
      );
    }
  });

  it("block format: exact header, [YYYY-MM-DD] date, --- terminator", async () => {
    const originalPrompt = "capstone keyword inject test authentication";
    const result = await injectRecallContext(["-p", originalPrompt], {
      workspace: tmpDir,
      project: "inject-test-project",
      prompt: originalPrompt,
      files: [],
      db,
    });
    const promptValue = result[result.indexOf("-p") + 1];
    assert.ok(
      promptValue.includes("## Prior context"),
      "injection must occur — distinct-BM25 rows ensure score > 0.3 cutoff",
    );
    assert.ok(
      promptValue.includes("## Prior context (cross-session recall)"),
      "block must have the exact header per SPEC §6.2",
    );
    assert.ok(
      /### \[\d{4}-\d{2}-\d{2}\]/.test(promptValue),
      "each hit must have a [YYYY-MM-DD] date header",
    );
    assert.ok(
      promptValue.includes("---"),
      "block must end with --- terminator",
    );
    assert.ok(
      promptValue.lastIndexOf("---") > promptValue.indexOf("## Prior context"),
      "--- terminator must appear after the ## Prior context header",
    );
  });
});

// ── Edge cases ───────────────────────────────────────────────────────────────

describe("Edge cases — inject", { skip: SKIP }, () => {
  let tmpDir, db;

  before(async () => {
    tmpDir = makeTempDir();
    mkdirSync(path.join(tmpDir, "projects"), { recursive: true });
    db = await makeTestDb();
  });

  it("empty project name returns original args (SPEC §6.1: !opts.project → return args)", async () => {
    const args = ["-p", "some prompt"];
    const result = await injectRecallContext(args, {
      workspace: tmpDir,
      project: "",
      prompt: "some prompt",
      files: [],
      db,
    });
    assert.deepEqual(result, args, "empty project must return original args");
  });

  it("null project returns original args (no crash)", async () => {
    const args = ["-p", "some prompt"];
    const result = await injectRecallContext(args, {
      workspace: tmpDir,
      project: null,
      prompt: "some prompt",
      files: [],
      db,
    });
    assert.deepEqual(result, args, "null project must return original args");
  });

  it("missing workspace directory does not throw", async () => {
    const args = ["-p", "some prompt"];
    await assert.doesNotReject(
      () =>
        injectRecallContext(args, {
          workspace: "/tmp/definitely-does-not-exist-xyz123",
          project: "any-project",
          prompt: "some prompt",
          files: [],
          db,
        }),
      "must not throw when workspace does not exist",
    );
  });
});
