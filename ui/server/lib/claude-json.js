import { readFile, writeFile } from "fs/promises";

import { GLOBAL_CLAUDE_JSON } from "./paths.js";

export async function readGlobalClaude() {
  try {
    return JSON.parse(await readFile(GLOBAL_CLAUDE_JSON, "utf8"));
  } catch {
    return {};
  }
}

export async function writeGlobalClaude(data) {
  await writeFile(GLOBAL_CLAUDE_JSON, JSON.stringify(data, null, 2));
}
