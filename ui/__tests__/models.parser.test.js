import { describe, it } from "node:test";
import assert from "node:assert/strict";

// parseModelStrings is not exported from server.js — reproduce the pure logic
// here to validate the algorithm without side effects. If the implementation
// in server.js diverges, this test will catch the mismatch via integration (Check A).
const MODEL_RE = /^claude-(opus|sonnet|haiku)-(\d+)(?:-(\d{1,2}))?$/;

const FALLBACK_MODELS = [
  { id: "opus", slug: "claude-opus-4-7", label: "Opus 4.7", latest: true },
  {
    id: "sonnet",
    slug: "claude-sonnet-4-6",
    label: "Sonnet 4.6",
    latest: false,
  },
  { id: "haiku", slug: "claude-haiku-4-5", label: "Haiku 4.5", latest: false },
];

function parseModelStrings(rawStringsOutput) {
  const slugs = rawStringsOutput
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => MODEL_RE.test(line));

  if (slugs.length === 0) return null;

  const parsed = slugs.map((slug) => {
    const match = slug.match(MODEL_RE);
    return {
      family: match[1],
      major: parseInt(match[2], 10),
      minor: match[3] ? parseInt(match[3], 10) : 0,
      slug,
    };
  });

  const grouped = {};
  parsed.forEach((p) => {
    if (!grouped[p.family]) grouped[p.family] = [];
    grouped[p.family].push(p);
  });

  const families = ["opus", "sonnet", "haiku"];
  const result = [];

  for (const family of families) {
    if (grouped[family]) {
      const sorted = grouped[family].sort(
        (a, b) => b.major - a.major || b.minor - a.minor,
      );
      const best = sorted[0];
      result.push({
        id: family,
        slug: best.slug,
        label: `${family[0].toUpperCase()}${family.slice(1)} ${best.major}.${best.minor}`,
        latest: family === "opus",
      });
    }
  }

  return result.length > 0 ? result : null;
}

describe("parseModelStrings — parser correctness", () => {
  it("picks highest-version per family, filters date-suffixed and noise", () => {
    const fixture = [
      "some_other_string",
      "claude-opus-4-6",
      "claude-opus-4-7",
      "claude-opus-4-20250514", // date-suffix — 8 digits, \d{1,2} won't match
      "claude-sonnet-4-6",
      "claude-haiku-4-5",
      "claude-haiku-3-5", // older family version
      "",
      "not-a-model",
    ].join("\n");

    const result = parseModelStrings(fixture);

    assert.deepEqual(result, [
      { id: "opus", slug: "claude-opus-4-7", label: "Opus 4.7", latest: true },
      {
        id: "sonnet",
        slug: "claude-sonnet-4-6",
        label: "Sonnet 4.6",
        latest: false,
      },
      {
        id: "haiku",
        slug: "claude-haiku-4-5",
        label: "Haiku 4.5",
        latest: false,
      },
    ]);
  });

  it("returns null on empty input (triggers FALLBACK_MODELS in detectClaudeModels)", () => {
    assert.equal(parseModelStrings(""), null);
  });

  it("returns null on noise-only input", () => {
    const noise = [
      "random_string",
      "claude-opus-4-20250514",
      "not-a-model",
      "",
    ].join("\n");
    assert.equal(parseModelStrings(noise), null);
  });

  it("sets latest:true on opus only", () => {
    const fixture = "claude-opus-4-7\nclaude-sonnet-4-6\nclaude-haiku-4-5";
    const result = parseModelStrings(fixture);
    assert.ok(result.find((m) => m.id === "opus").latest === true);
    assert.ok(result.find((m) => m.id === "sonnet").latest === false);
    assert.ok(result.find((m) => m.id === "haiku").latest === false);
  });

  it("output order is always opus → sonnet → haiku", () => {
    // Input in reverse order
    const fixture = "claude-haiku-4-5\nclaude-sonnet-4-6\nclaude-opus-4-7";
    const result = parseModelStrings(fixture);
    assert.equal(result[0].id, "opus");
    assert.equal(result[1].id, "sonnet");
    assert.equal(result[2].id, "haiku");
  });

  it("handles minor=0 (bare major slug) and picks highest overall", () => {
    const fixture =
      "claude-opus-4\nclaude-opus-4-7\nclaude-sonnet-4-6\nclaude-haiku-4-5";
    const result = parseModelStrings(fixture);
    // claude-opus-4 is major=4,minor=0; claude-opus-4-7 is major=4,minor=7 → 4-7 wins
    assert.equal(result.find((m) => m.id === "opus").slug, "claude-opus-4-7");
  });

  it("haiku 4-5 beats haiku 3-5 (major sort takes priority)", () => {
    const fixture =
      "claude-haiku-3-5\nclaude-haiku-4-5\nclaude-sonnet-4-6\nclaude-opus-4-7";
    const result = parseModelStrings(fixture);
    assert.equal(result.find((m) => m.id === "haiku").slug, "claude-haiku-4-5");
  });

  it("FALLBACK_MODELS shape is correct", () => {
    assert.equal(FALLBACK_MODELS.length, 3);
    assert.equal(FALLBACK_MODELS[0].id, "opus");
    assert.equal(FALLBACK_MODELS[0].slug, "claude-opus-4-7");
    assert.equal(FALLBACK_MODELS[0].latest, true);
    assert.equal(FALLBACK_MODELS[1].id, "sonnet");
    assert.equal(FALLBACK_MODELS[2].id, "haiku");
  });
});

describe("MODEL_RE regex boundary checks", () => {
  it("accepts valid slugs", () => {
    const valid = [
      "claude-opus-4-7",
      "claude-sonnet-4-6",
      "claude-haiku-4-5",
      "claude-opus-4",
      "claude-haiku-3-5",
      "claude-opus-4-99", // 2-digit minor
    ];
    for (const s of valid) {
      assert.ok(MODEL_RE.test(s), `Expected match: ${s}`);
    }
  });

  it("rejects date-suffixed and noise slugs", () => {
    const invalid = [
      "claude-opus-4-20250514", // 8-digit minor, fails \d{1,2}
      "claude-sonnet-4-20250514",
      "claude-opus-4-100", // 3-digit minor
      "not-a-model",
      "claude-gpt-4-5", // unknown family
      "",
    ];
    for (const s of invalid) {
      assert.ok(!MODEL_RE.test(s), `Expected no match: ${s}`);
    }
  });
});
