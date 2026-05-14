import { recallContext } from "./recall.js";
import { getDb } from "./db.js";
import matter from "gray-matter";
import { readFileSync, existsSync } from "fs";
import path from "path";

const MAX_INJECTED_CHARS = 6000;
const MAX_HITS = 3;
const RECALL_TIMEOUT_MS = 80;
const FRONTMATTER_CACHE = new Map();
const FRONTMATTER_CACHE_TTL = 30000;

export async function injectRecallContext(args, opts) {
  if (!opts.project || isOptedOut(opts.workspace, opts.project)) {
    return args;
  }

  const t0 = Date.now();
  const db = opts.db || getDb();
  const hits = await Promise.race([
    Promise.resolve(db).then((d) =>
      recallContext(
        {
          q: opts.prompt || "",
          file: opts.files?.[0] || null,
          project: null,
          limit: MAX_HITS,
          cutoff: 0.3,
        },
        d,
      ),
    ),
    new Promise((r) => setTimeout(() => r([]), RECALL_TIMEOUT_MS)),
  ]);

  if (!hits.length) return args;

  const block = formatPriorContextBlock(hits);
  const idx = args.indexOf("-p");
  if (idx === -1 || !args[idx + 1]) return args;

  const out = args.slice();
  out[idx + 1] = `${block}\n\n${out[idx + 1]}`;

  const dt = Date.now() - t0;
  if (dt > 100) console.warn(`memory: inject took ${dt}ms (over 100ms budget)`);
  return out;
}

function isOptedOut(workspace, project) {
  const cacheKey = `${workspace}:${project}`;
  const cached = FRONTMATTER_CACHE.get(cacheKey);

  if (cached && cached.expiry > Date.now()) {
    return cached.value;
  }

  const p = path.join(workspace, "projects", project, "context.md");
  let result = false;

  if (existsSync(p)) {
    try {
      const fm = matter(readFileSync(p, "utf8")).data || {};
      result = fm.memory_recall === false;
    } catch {
      result = false;
    }
  }

  FRONTMATTER_CACHE.set(cacheKey, {
    value: result,
    expiry: Date.now() + FRONTMATTER_CACHE_TTL,
  });

  return result;
}

function formatPriorContextBlock(hits) {
  const lines = [];
  lines.push("## Prior context (cross-session recall)");
  lines.push("");
  lines.push(
    "The following snippets are from prior Claude sessions on this host. They are",
  );
  lines.push("auto-injected for context — verify before relying on them.");
  lines.push("");

  let totalChars = lines.join("\n").length;

  for (const hit of hits) {
    if (totalChars >= MAX_INJECTED_CHARS) break;

    const date = new Date(hit.ts).toISOString().split("T")[0];
    const sid = hit.session_id.slice(0, 8);
    const basenames = hit.files.map((f) => path.basename(f)).join(", ");

    const hitLines = [];
    hitLines.push(`### [${date}] ${hit.project} (session ${sid}…)`);
    if (basenames) {
      hitLines.push(`files: ${basenames}`);
    }
    hitLines.push(hit.text);
    hitLines.push(`(truncated — full transcript: ${hit.source_path})`);
    hitLines.push("");

    const hitText = hitLines.join("\n");
    const hitChars = Buffer.byteLength(hitText);

    if (totalChars + hitChars > MAX_INJECTED_CHARS) {
      // Truncate this hit's text
      const budgetLeft = MAX_INJECTED_CHARS - totalChars;
      const textLines = [`### [${date}] ${hit.project} (session ${sid}…)`];
      if (basenames) {
        textLines.push(`files: ${basenames}`);
      }
      let textSnippet = hit.text;
      while (
        Buffer.byteLength(textLines.concat(textSnippet).join("\n")) > budgetLeft
      ) {
        textSnippet = textSnippet.slice(0, -1);
      }
      textLines.push(textSnippet);
      textLines.push(`(truncated — full transcript: ${hit.source_path})`);
      lines.push(textLines.join("\n"));
      break;
    } else {
      lines.push(hitText);
      totalChars += hitChars;
    }
  }

  lines.push("---");
  return lines.join("\n");
}
