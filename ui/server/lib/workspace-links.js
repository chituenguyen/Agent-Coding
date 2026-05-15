import {
  readdir,
  readFile,
  writeFile,
  mkdir,
  stat,
  readlink,
  symlink,
  unlink,
} from "fs/promises";
import { existsSync, realpathSync } from "fs";
import path from "path";

import { WORKSPACE } from "./paths.js";
import { lstatSafe } from "./fs-json.js";

export const WORKSPACE_LINK_KINDS = [
  { kind: "agents", granularity: "file" },
  { kind: "commands", granularity: "file" },
  { kind: "skills", granularity: "directory" },
];

export const GITIGNORE_LINK_LINES = [
  "/.claude/agents/",
  "/.claude/skills/",
  "/.claude/commands/",
];

export function workspaceKindDir(kind) {
  return path.join(WORKSPACE, ".claude", kind);
}

export function assertRepoPath(repoPath) {
  if (!repoPath || typeof repoPath !== "string") {
    const err = new Error("repoPath required");
    err.code = "EBADPATH";
    throw err;
  }
  if (!path.isAbsolute(repoPath)) {
    const err = new Error("repoPath must be absolute");
    err.code = "EBADPATH";
    throw err;
  }
  if (!existsSync(repoPath)) {
    const err = new Error(`repoPath does not exist: ${repoPath}`);
    err.code = "ENOENT";
    throw err;
  }
}

export async function listWorkspaceLinkSources() {
  const out = {};
  for (const { kind, granularity } of WORKSPACE_LINK_KINDS) {
    const dir = workspaceKindDir(kind);
    let entries = [];
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      out[kind] = [];
      continue;
    }
    const sources = [];
    for (const e of entries) {
      if (granularity === "file") {
        if (e.isFile() && e.name.endsWith(".md")) {
          sources.push({ name: e.name, absPath: path.join(dir, e.name) });
        }
      } else {
        if (e.isDirectory()) {
          sources.push({ name: e.name, absPath: path.join(dir, e.name) });
        }
      }
    }
    sources.sort((a, b) => a.name.localeCompare(b.name));
    out[kind] = sources;
  }
  return out;
}

export async function linkRepo(repoPath) {
  assertRepoPath(repoPath);
  const sources = await listWorkspaceLinkSources();
  const result = { created: 0, skipped: 0, errors: [], overrides: [] };

  for (const { kind } of WORKSPACE_LINK_KINDS) {
    const linkDir = path.join(repoPath, ".claude", kind);
    try {
      await mkdir(linkDir, { recursive: true });
    } catch (err) {
      result.errors.push({ path: linkDir, message: err.message });
      continue;
    }

    for (const src of sources[kind] || []) {
      const targetPath = path.join(linkDir, src.name);
      const relTarget = path.relative(linkDir, src.absPath);

      try {
        const st = await lstatSafe(targetPath);
        if (!st) {
          await symlink(relTarget, targetPath);
          result.created++;
          continue;
        }
        if (st.isSymbolicLink()) {
          const current = await readlink(targetPath);
          if (current === relTarget) {
            result.skipped++;
          } else {
            await unlink(targetPath);
            await symlink(relTarget, targetPath);
            result.created++;
          }
        } else {
          result.overrides.push(`${kind}/${src.name}`);
        }
      } catch (err) {
        result.errors.push({ path: targetPath, message: err.message });
      }
    }
  }
  return result;
}

export async function unlinkRepo(repoPath) {
  assertRepoPath(repoPath);
  const result = { removed: 0, kept: 0, errors: [] };

  for (const { kind } of WORKSPACE_LINK_KINDS) {
    const linkDir = path.join(repoPath, ".claude", kind);
    let entries = [];
    try {
      entries = await readdir(linkDir);
    } catch {
      continue;
    }
    for (const name of entries) {
      const entryPath = path.join(linkDir, name);
      try {
        const st = await lstatSafe(entryPath);
        if (!st) continue;
        if (st.isSymbolicLink()) {
          await unlink(entryPath);
          result.removed++;
        } else {
          result.kept++;
        }
      } catch (err) {
        result.errors.push({ path: entryPath, message: err.message });
      }
    }
  }
  return result;
}

export async function checkLinks(repoPath) {
  assertRepoPath(repoPath);
  const sources = await listWorkspaceLinkSources();
  const missing = [];
  const broken = [];
  const overrides = [];
  const valid = [];

  for (const { kind } of WORKSPACE_LINK_KINDS) {
    const linkDir = path.join(repoPath, ".claude", kind);
    for (const src of sources[kind] || []) {
      const targetPath = path.join(linkDir, src.name);
      const label = `${kind}/${src.name}`;
      const st = await lstatSafe(targetPath);
      if (!st) {
        missing.push(label);
        continue;
      }
      if (st.isSymbolicLink()) {
        try {
          const resolved = await stat(targetPath);
          if (!resolved) {
            broken.push(label);
            continue;
          }
          let realResolved;
          try {
            realResolved = realpathSync(targetPath);
          } catch {
            broken.push(label);
            continue;
          }
          if (realResolved === src.absPath) {
            valid.push(label);
          } else {
            broken.push(label);
          }
        } catch {
          broken.push(label);
        }
      } else {
        overrides.push(label);
      }
    }
  }

  let status;
  if (broken.length > 0) status = "broken";
  else if (missing.length > 0 && valid.length + overrides.length > 0)
    status = "partial";
  else if (valid.length === 0 && overrides.length === 0 && broken.length === 0)
    status = "unlinked";
  else status = "linked";

  return { status, missing, broken, overrides, valid };
}

export async function repairLinks(repoPath) {
  assertRepoPath(repoPath);
  for (const { kind } of WORKSPACE_LINK_KINDS) {
    const linkDir = path.join(repoPath, ".claude", kind);
    let entries = [];
    try {
      entries = await readdir(linkDir);
    } catch {
      continue;
    }
    for (const name of entries) {
      const entryPath = path.join(linkDir, name);
      const st = await lstatSafe(entryPath);
      if (!st || !st.isSymbolicLink()) continue;
      try {
        await stat(entryPath); // follows — throws if broken
      } catch {
        try {
          await unlink(entryPath);
        } catch {}
      }
    }
  }
  await linkRepo(repoPath);
  return await checkLinks(repoPath);
}

export async function ensureGitignore(repoPath) {
  assertRepoPath(repoPath);
  const gitignorePath = path.join(repoPath, ".gitignore");
  let existing = "";
  try {
    existing = await readFile(gitignorePath, "utf8");
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
  }
  const existingLines = new Set(
    existing
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean),
  );
  const toAppend = GITIGNORE_LINK_LINES.filter((l) => !existingLines.has(l));
  if (toAppend.length === 0) {
    return { appended: false, lines: [] };
  }
  let prefix = "";
  if (existing.length > 0) {
    prefix = existing.endsWith("\n\n")
      ? ""
      : existing.endsWith("\n")
        ? "\n"
        : "\n\n";
  }
  const block = prefix + toAppend.join("\n") + "\n";
  await writeFile(gitignorePath, existing + block, "utf8");
  return { appended: true, lines: toAppend };
}
