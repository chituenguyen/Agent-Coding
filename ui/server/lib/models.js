import { execSync } from "child_process";
import { realpathSync, statSync } from "fs";

import { modelCache } from "../state/caches.js";

export const FALLBACK_MODELS = [
  { id: "opus", slug: "claude-opus-4-7", label: "Opus 4.7", latest: true },
  {
    id: "sonnet",
    slug: "claude-sonnet-4-6",
    label: "Sonnet 4.6",
    latest: false,
  },
  { id: "haiku", slug: "claude-haiku-4-5", label: "Haiku 4.5", latest: false },
];

export const MODEL_RE = /^claude-(opus|sonnet|haiku)-(\d+)(?:-(\d{1,2}))?$/;

export function parseModelStrings(rawStringsOutput) {
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

export function detectClaudeModels() {
  try {
    const claudePath = execSync("which claude", { encoding: "utf8" }).trim();
    const real = realpathSync(claudePath);
    const mtime = statSync(real).mtimeMs;

    if (modelCache.mtime === mtime && modelCache.list) {
      return modelCache.list;
    }

    const stringsOutput = execSync(
      `strings "${real}" | grep -E "^claude-(opus|sonnet|haiku)-[0-9]+(\\-[0-9]+)?$" | sort -u`,
      { encoding: "utf8", maxBuffer: 50 * 1024 * 1024 },
    );

    const parsed = parseModelStrings(stringsOutput);
    if (!parsed) {
      return FALLBACK_MODELS;
    }

    modelCache.mtime = mtime;
    modelCache.list = parsed;
    return parsed;
  } catch {
    return FALLBACK_MODELS;
  }
}
