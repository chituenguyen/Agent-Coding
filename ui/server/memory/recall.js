import path from "path";

export function recallContext(
  { q = "", file = null, project = null, limit = 5, cutoff = 0.25 },
  db,
) {
  limit = Math.min(limit || 5, 20);
  cutoff = cutoff ?? 0.25;

  if (!q && !file) return [];

  const now = Date.now();
  const query = buildFtsQuery(q || (file ? path.basename(file) : ""));
  if (!query) return [];

  try {
    const hits = db
      .prepare(
        `
      SELECT t.*, bm25(turns_fts) AS bm25
      FROM turns_fts
      JOIN turns t ON t.id = turns_fts.rowid
      WHERE turns_fts MATCH ?
        AND (? IS NULL OR t.project = ?)
      ORDER BY bm25 LIMIT 50
    `,
      )
      .all(query, project || null, project || null);

    if (!hits || hits.length === 0) return [];

    // Score
    const scored = hits.map((hit) => {
      const bm25Score = hit.bm25;
      const bm25Norm = normalizeBm25(bm25Score, hits);
      const recencyDecay = getRecencyDecay(hit.ts, now);
      const fileOverlap = getFileOverlap(hit.files, file);

      const rawScore = 0.6 * bm25Norm + 0.2 * recencyDecay + 0.2 * fileOverlap;

      return {
        ...hit,
        rawScore,
      };
    });

    // Filter below cutoff
    const filtered = scored.filter((h) => h.rawScore >= cutoff);
    if (filtered.length === 0) return [];

    // Normalize scores to [0, 1]
    const minScore = Math.min(...filtered.map((h) => h.rawScore));
    const maxScore = Math.max(...filtered.map((h) => h.rawScore));
    const normalized = filtered.map((h) => ({
      ...h,
      score:
        maxScore === minScore
          ? 1
          : (h.rawScore - minScore) / (maxScore - minScore),
    }));

    // Sort and truncate
    normalized.sort((a, b) => b.score - a.score);
    const results = normalized.slice(0, limit);

    // Format response
    return results.map((hit) => ({
      turn_id: hit.id,
      session_id: hit.session_id,
      project: hit.project,
      source_path: hit.source_path,
      ts: hit.ts,
      text: truncateText(hit.text, 1200),
      files: JSON.parse(hit.files || "[]"),
      score: hit.score,
    }));
  } catch (err) {
    console.error("recall error:", err);
    return [];
  }
}

function buildFtsQuery(q) {
  if (!q) return null;
  // Escape quotes
  const escaped = q.replace(/"/g, '""');
  // Try phrase search first, then OR-joined tokens
  return `"${escaped}" OR ${escaped.split(/\s+/).join(" OR ")}`;
}

function normalizeBm25(bm25, allHits) {
  const bm25Scores = allHits.map((h) => h.bm25);
  const maxBm25 = Math.max(...bm25Scores);
  const minBm25 = Math.min(...bm25Scores);
  return (maxBm25 - bm25) / (maxBm25 - minBm25 + 1e-9);
}

function getRecencyDecay(ts, now) {
  const dayMs = 86400000;
  const halfLifeDays = 14;
  const elapsedDays = (now - ts) / dayMs;
  return Math.pow(0.5, elapsedDays / halfLifeDays);
}

function getFileOverlap(filesJson, queryFile) {
  if (!queryFile) return 0;
  try {
    const tFiles = JSON.parse(filesJson || "[]");
    const qBase = path.basename(queryFile);
    const qSeg = queryFile.split("/").slice(-3).join("/");

    for (const tf of tFiles) {
      if (path.basename(tf) === qBase) return 1;
      if (tf.endsWith(qSeg)) return 1;
    }
  } catch {
    // Ignore
  }
  return 0;
}

function truncateText(text, maxChars) {
  if (text.length <= maxChars) return text;
  let truncated = text.slice(0, maxChars);
  // Try to preserve sentence boundary
  const lastDot = truncated.lastIndexOf(".");
  const lastNewline = truncated.lastIndexOf("\n");
  const boundary = Math.max(lastDot, lastNewline);
  if (boundary > maxChars - 200) {
    truncated = text.slice(0, boundary + 1);
  }
  return truncated;
}
