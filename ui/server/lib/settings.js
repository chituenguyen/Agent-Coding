import { readFile } from "fs/promises";

import {
  GLOBAL_SETTINGS,
  WORKSPACE_NAME_FILE,
  DEFAULT_WORKSPACE_NAME,
} from "./paths.js";

export async function readSettings() {
  try {
    return JSON.parse(await readFile(GLOBAL_SETTINGS, "utf8"));
  } catch {
    return {};
  }
}

export async function readWorkspaceName() {
  try {
    const raw = (await readFile(WORKSPACE_NAME_FILE, "utf8")).trim();
    if (!raw) return { name: DEFAULT_WORKSPACE_NAME, custom: false };
    return { name: raw, custom: true };
  } catch {
    return { name: DEFAULT_WORKSPACE_NAME, custom: false };
  }
}

export function deepMerge(target, source) {
  const out = { ...target };
  for (const [k, v] of Object.entries(source)) {
    if (
      v &&
      typeof v === "object" &&
      !Array.isArray(v) &&
      typeof target[k] === "object"
    )
      out[k] = deepMerge(target[k], v);
    else out[k] = v;
  }
  return out;
}
