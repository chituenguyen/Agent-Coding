import { readFile, writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";

import { WORKSPACE, chatsDir } from "./paths.js";

export const chatPath = (id) => path.join(chatsDir(), `${id}.json`);

export async function ensureChatsDir() {
  if (!existsSync(chatsDir())) await mkdir(chatsDir(), { recursive: true });
}

export async function readChat(id) {
  try {
    return JSON.parse(await readFile(chatPath(id), "utf8"));
  } catch {
    return null;
  }
}

export async function writeChat(chat) {
  await ensureChatsDir();
  await writeFile(chatPath(chat.id), JSON.stringify(chat, null, 2));
}

export function sanitizeFilename(name) {
  return (name || "file").replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 80);
}

export function chatSpawnCwd(chat) {
  // Trading + no-folder chats land here → WORKSPACE.
  const folders = (chat?.folderPaths || []).filter(
    (p) => p && p !== WORKSPACE && existsSync(p),
  );
  return folders[0] || WORKSPACE;
}
