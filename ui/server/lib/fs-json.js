import { readFile, writeFile, readdir, stat, lstat } from "fs/promises";
import { existsSync } from "fs";

export async function readIfExists(filePath) {
  if (!existsSync(filePath)) return null;
  return readFile(filePath, "utf8");
}

export async function readJsonSafe(absPath) {
  try {
    return JSON.parse(await readFile(absPath, "utf8"));
  } catch (err) {
    if (err && err.code === "ENOENT") return null;
    console.warn(`[scan] unreadable ${absPath}: ${err.message}`);
    return undefined; // exists but unparseable
  }
}

export async function statSafe(absPath) {
  try {
    return await stat(absPath);
  } catch {
    return null;
  }
}

export async function lstatSafe(p) {
  try {
    return await lstat(p);
  } catch {
    return null;
  }
}

export async function listDirEntries(absPath) {
  try {
    return await readdir(absPath, { withFileTypes: true });
  } catch {
    return null;
  }
}

export async function writeJson(absPath, data) {
  await writeFile(absPath, JSON.stringify(data, null, 2));
}
