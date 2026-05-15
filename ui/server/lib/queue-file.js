import { readFile, writeFile } from "fs/promises";

import { queuePath } from "./paths.js";

export async function readQueue() {
  try {
    const raw = await readFile(queuePath(), "utf8");
    return JSON.parse(raw);
  } catch {
    return { tasks: [] };
  }
}

export async function writeQueue(data) {
  await writeFile(queuePath(), JSON.stringify(data, null, 2));
}
