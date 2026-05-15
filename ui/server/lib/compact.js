import { spawn } from "child_process";

import { WORKSPACE } from "./paths.js";
import { chatSpawnCwd } from "./chat-files.js";

// Auto-compact threshold. When a turn's total context (prompt + cache + output)
// reaches this, the next user send transparently runs `/compact` first so the
// resumed session starts with a summarised history. Hard-coded 200k * 70%.
export const AUTO_COMPACT_TOKENS = 140_000;

export async function runCompactIfNeeded(chat, broadcast) {
  const tokens = chat.lastContextTokens || 0;
  if (tokens < AUTO_COMPACT_TOKENS || !chat.sessionId) return false;
  broadcast?.({
    type: "chat-tool",
    name: "Compact",
    input: { reason: `context ${tokens} tokens (>= ${AUTO_COMPACT_TOKENS})` },
  });
  return await new Promise((resolve) => {
    const args = [
      "-p",
      "/compact",
      "--output-format",
      "stream-json",
      "--verbose",
      "--dangerously-skip-permissions",
      "--resume",
      chat.sessionId,
    ];
    const spawnCwd = chatSpawnCwd(chat);
    if (spawnCwd !== WORKSPACE) args.push("--add-dir", WORKSPACE);
    const proc = spawn("claude", args, {
      cwd: spawnCwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let buf = "";
    let newSid = null;
    proc.stdout.on("data", (chunk) => {
      buf += chunk.toString();
      const lines = buf.split("\n");
      buf = lines.pop();
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const e = JSON.parse(line);
          if (e.session_id) newSid = e.session_id;
        } catch {}
      }
    });
    proc.on("close", () => {
      if (newSid && newSid !== chat.sessionId) chat.sessionId = newSid;
      // After compaction the next prompt starts fresh — reset the counter so
      // we don't loop-compact while the new session is still small.
      chat.lastContextTokens = 0;
      resolve(true);
    });
    proc.on("error", () => resolve(false));
  });
}
