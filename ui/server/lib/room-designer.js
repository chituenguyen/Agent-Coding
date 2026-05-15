import { readFile } from "fs/promises";
import path from "path";
import { spawn } from "child_process";
import matter from "gray-matter";

import { WORKSPACE } from "./paths.js";

// Decision 3A: tools allowlist is deny-by-default. Generated agents may only
// hold SAFE_TOOLS unless the user explicitly toggled `tools_acknowledged` on
// the agentDef (per-team opt-in for dangerous tools).
export const SAFE_TOOLS = new Set([
  "Read",
  "Grep",
  "Glob",
  "WebFetch",
  "WebSearch",
]);

export function validateAgentDef(def, teamLabel) {
  if (!def || typeof def !== "object")
    return `${teamLabel}: agentDef must be an object`;
  if (typeof def.systemPrompt !== "string" || !def.systemPrompt.trim())
    return `${teamLabel}: agentDef.systemPrompt is required`;
  if (def.model && typeof def.model !== "string")
    return `${teamLabel}: agentDef.model must be a string`;
  const tools = Array.isArray(def.tools) ? def.tools : [];
  if (!def.tools_acknowledged) {
    const offending = tools.filter((t) => !SAFE_TOOLS.has(t));
    if (offending.length) {
      return `${teamLabel}: dangerous tools require opt-in (tools_acknowledged): ${offending.join(", ")}`;
    }
  }
  return null;
}

// Run the room-designer agent with a structured payload. Returns parsed JSON
// from the agent's first {...} block. Throws on parse failure.
export async function runRoomDesigner(payload, { stream, res } = {}) {
  const agentFile = await readFile(
    path.join(WORKSPACE, ".claude/agents/room-designer.md"),
    "utf8",
  );
  const systemPrompt = matter(agentFile).content.trim();
  const userMessage = JSON.stringify(payload);

  return new Promise((resolve, reject) => {
    const proc = spawn(
      "claude",
      ["--system-prompt", systemPrompt, "-p", userMessage],
      { cwd: WORKSPACE, env: process.env, stdio: ["ignore", "pipe", "pipe"] },
    );
    let full = "";
    proc.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      full += text;
      if (stream && res) res.write(JSON.stringify({ chunk: text }) + "\n");
    });
    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`Claude exited with code ${code}`));
        return;
      }
      const match = full.match(/\{[\s\S]*\}/);
      if (!match) {
        reject(new Error("Could not find JSON in Claude response"));
        return;
      }
      try {
        resolve(JSON.parse(match[0]));
      } catch (err) {
        reject(new Error(`Invalid JSON from Claude: ${err.message}`));
      }
    });
    proc.on("error", reject);
  });
}
