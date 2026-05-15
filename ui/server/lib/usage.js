import { appendFile, readFile } from "fs/promises";
import { usagePath } from "./paths.js";

export async function logUsage(entry) {
  const line =
    JSON.stringify({ at: new Date().toISOString(), ...entry }) + "\n";
  try {
    await appendFile(usagePath(), line);
  } catch (e) {
    console.warn("[usage] append failed:", e.message);
  }
}

export function extractUsage(event) {
  if (!event || event.type !== "result") return null;
  const u = event.usage || {};
  return {
    cost_usd: event.total_cost_usd || 0,
    duration_ms: event.duration_ms || 0,
    duration_api_ms: event.duration_api_ms || 0,
    num_turns: event.num_turns || 0,
    tokens: {
      input: u.input_tokens || 0,
      output: u.output_tokens || 0,
      cache_read: u.cache_read_input_tokens || 0,
      cache_creation: u.cache_creation_input_tokens || 0,
    },
    is_error: !!event.is_error,
    session_id: event.session_id || null,
  };
}

export async function readUsageEntries(limit = 1000) {
  try {
    const raw = await readFile(usagePath(), "utf8");
    const lines = raw.split("\n").filter(Boolean);
    const slice = lines.slice(-limit);
    return slice
      .map((l) => {
        try {
          return JSON.parse(l);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}
