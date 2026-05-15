#!/usr/bin/env node
// Migrate workspace → repo agent/skill/command links.
// Idempotent: real files preserved, symlinks reconciled, .gitignore deduped.
//
// Helpers are INLINED here (NOT imported from ui/server.js) so this script
// has no side effects from the live backend. See SPEC §5.

import {
  readdir,
  readFile,
  writeFile,
  mkdir,
  lstat,
  readlink,
  symlink,
  unlink,
} from "node:fs/promises";
import { existsSync, realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WORKSPACE = path.resolve(__dirname, "..");

const WORKSPACE_LINK_KINDS = [
  { kind: "agents", granularity: "file" },
  { kind: "commands", granularity: "file" },
  { kind: "skills", granularity: "directory" },
];

const GITIGNORE_LINK_LINES = [
  "/.claude/agents/",
  "/.claude/skills/",
  "/.claude/commands/",
];

function workspaceKindDir(kind) {
  return path.join(WORKSPACE, ".claude", kind);
}

function assertRepoPath(repoPath) {
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

async function lstatSafe(p) {
  try {
    return await lstat(p);
  } catch {
    return null;
  }
}

async function listWorkspaceLinkSources() {
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

async function linkRepo(repoPath) {
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

async function ensureGitignore(repoPath) {
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

async function readJsonSafe(absPath) {
  try {
    return JSON.parse(await readFile(absPath, "utf8"));
  } catch {
    return null;
  }
}

async function collectRepoPaths() {
  const paths = new Set();

  const mcp = await readJsonSafe(path.join(WORKSPACE, "mcp_server.json"));
  for (const r of (mcp && mcp.repositories) || []) {
    if (r && typeof r.path === "string" && r.path.trim()) {
      paths.add(r.path.trim());
    }
  }

  const companies = await readJsonSafe(path.join(WORKSPACE, "companies.json"));
  for (const co of (companies && companies.companies) || []) {
    for (const room of co.rooms || []) {
      for (const team of room.teams || []) {
        for (const repo of team.repos || []) {
          if (typeof repo === "string" && repo.trim()) paths.add(repo.trim());
        }
      }
    }
  }

  // Don't link the workspace into itself.
  paths.delete(WORKSPACE);
  return [...paths];
}

async function main() {
  const repos = await collectRepoPaths();
  const summary = {
    repoCount: 0,
    skipped: [],
    totalCreated: 0,
    totalSkipped: 0,
    overrides: [],
    errors: [],
    gitignoreAppended: 0,
  };

  console.log(`Found ${repos.length} unique repo path(s) to process.\n`);

  for (const repoPath of repos) {
    if (!existsSync(repoPath)) {
      summary.skipped.push({ path: repoPath, reason: "missing" });
      console.log(`  - SKIP (missing): ${repoPath}`);
      continue;
    }
    try {
      const linkResult = await linkRepo(repoPath);
      const ignoreResult = await ensureGitignore(repoPath);
      summary.repoCount++;
      summary.totalCreated += linkResult.created;
      summary.totalSkipped += linkResult.skipped;
      if (linkResult.overrides.length) {
        for (const ov of linkResult.overrides) {
          summary.overrides.push(`${repoPath}: ${ov}`);
        }
      }
      if (linkResult.errors.length) {
        for (const e of linkResult.errors) {
          summary.errors.push(`${repoPath}: ${e.path} — ${e.message}`);
        }
      }
      if (ignoreResult.appended) summary.gitignoreAppended++;
      console.log(
        `  - OK   ${repoPath}: +${linkResult.created} created, ${linkResult.skipped} skipped, ${linkResult.overrides.length} overrides; gitignore appended=${ignoreResult.appended}`,
      );
    } catch (err) {
      summary.errors.push(`${repoPath}: ${err.message}`);
      console.log(`  - FAIL ${repoPath}: ${err.message}`);
    }
  }

  console.log("\nMigration complete:");
  console.log(`  repos processed:     ${summary.repoCount}`);
  console.log(`  repos skipped:       ${summary.skipped.length}`);
  console.log(`  symlinks created:    ${summary.totalCreated}`);
  console.log(`  symlinks skipped:    ${summary.totalSkipped}`);
  console.log(`  overrides preserved: ${summary.overrides.length}`);
  console.log(`  gitignore appended:  ${summary.gitignoreAppended}`);
  if (summary.overrides.length) {
    console.log("\nPotential overrides (real files present, NOT replaced):");
    for (const o of summary.overrides) console.log(`  • ${o}`);
  }
  if (summary.errors.length) {
    console.log("\nErrors:");
    for (const e of summary.errors) console.log(`  ! ${e}`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(`migrate-repo-links failed: ${err.message}`);
  process.exit(1);
});
