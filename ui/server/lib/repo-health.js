import { readFile, writeFile, stat, rename } from "fs/promises";
import path from "path";

import { readJsonSafe, statSafe, listDirEntries } from "./fs-json.js";
import { lookupCompanyForPath } from "./companies.js";
import { checkLinks } from "./workspace-links.js";
import { REPO_HEALTH_CACHE } from "../state/caches.js";

export function invalidateHealthCache(name) {
  REPO_HEALTH_CACHE.delete(name);
}

export async function scanRepoHealth(repo, companyMap, globalClaude) {
  const repoPath = repo.path || "";
  const company = lookupCompanyForPath(companyMap, repoPath);
  const lastScannedAt = new Date().toISOString();

  const emptyPayload = {
    name: repo.name,
    repoPath,
    company,
    exists: false,
    claudeMd: { exists: false, mtime: null, size: null },
    settings: {
      exists: false,
      localExists: false,
      hookCount: 0,
      permissionAllowCount: 0,
      permissionDenyCount: 0,
      additionalDirectoriesCount: 0,
    },
    agents: { count: 0, names: [] },
    skills: { count: 0, names: [] },
    mcp: {
      dotMcpJsonExists: false,
      dotMcpJsonServerCount: 0,
      workspaceManagedServerCount: 0,
      enabledMcpServers: [],
      disabledMcpServers: [],
      enabledMcpjsonServers: [],
      disabledMcpjsonServers: [],
    },
    lastScannedAt,
  };

  if (!repoPath) return emptyPayload;
  const repoStat = await statSafe(repoPath);
  if (!repoStat || !repoStat.isDirectory()) return emptyPayload;

  const claudeMdPath = path.join(repoPath, "CLAUDE.md");
  const settingsPath = path.join(repoPath, ".claude", "settings.json");
  const settingsLocalPath = path.join(
    repoPath,
    ".claude",
    "settings.local.json",
  );
  const agentsDir = path.join(repoPath, ".claude", "agents");
  const skillsDir = path.join(repoPath, ".claude", "skills");
  const dotMcpPath = path.join(repoPath, ".mcp.json");

  const [
    claudeMdStat,
    settingsJson,
    settingsLocalStat,
    agentEntries,
    skillEntries,
    dotMcpJson,
    linksResult,
  ] = await Promise.all([
    statSafe(claudeMdPath),
    readJsonSafe(settingsPath),
    statSafe(settingsLocalPath),
    listDirEntries(agentsDir),
    listDirEntries(skillsDir),
    readJsonSafe(dotMcpPath),
    checkLinks(repoPath).catch((err) => {
      console.warn(`[scan] checkLinks failed for ${repoPath}: ${err.message}`);
      return null;
    }),
  ]);

  const claudeMd = {
    exists: !!claudeMdStat,
    mtime: claudeMdStat ? claudeMdStat.mtime.toISOString() : null,
    size: claudeMdStat ? claudeMdStat.size : null,
  };

  const settingsExists = settingsJson !== null;
  const s =
    settingsJson && typeof settingsJson === "object" ? settingsJson : {};
  const perm =
    s.permissions && typeof s.permissions === "object" ? s.permissions : {};
  const hooks = s.hooks && typeof s.hooks === "object" ? s.hooks : {};
  const settings = {
    exists: settingsExists,
    localExists: !!settingsLocalStat,
    hookCount: Object.keys(hooks).length,
    permissionAllowCount: Array.isArray(perm.allow) ? perm.allow.length : 0,
    permissionDenyCount: Array.isArray(perm.deny) ? perm.deny.length : 0,
    additionalDirectoriesCount: Array.isArray(perm.additionalDirectories)
      ? perm.additionalDirectories.length
      : 0,
  };

  const agentNames = (agentEntries || [])
    .filter((e) => e.isFile() && e.name.endsWith(".md"))
    .map((e) => e.name.replace(/\.md$/, ""))
    .sort();
  const agents = { count: agentNames.length, names: agentNames };

  const skillNames = (skillEntries || [])
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
  const skills = { count: skillNames.length, names: skillNames };

  const dotMcpExists = dotMcpJson !== null;
  const dotMcpServers =
    dotMcpJson && typeof dotMcpJson === "object" && dotMcpJson.mcpServers
      ? dotMcpJson.mcpServers
      : {};
  const workspaceManaged =
    repo.mcpServers && typeof repo.mcpServers === "object"
      ? Object.keys(repo.mcpServers)
      : [];

  const projects = (globalClaude && globalClaude.projects) || {};
  const proj = projects[repoPath] || {};
  const arrOr = (v) => (Array.isArray(v) ? v : []);

  const mcp = {
    dotMcpJsonExists: dotMcpExists,
    dotMcpJsonServerCount: Object.keys(dotMcpServers).length,
    workspaceManagedServerCount: workspaceManaged.length,
    enabledMcpServers: arrOr(proj.enabledMcpServers),
    disabledMcpServers: arrOr(proj.disabledMcpServers),
    enabledMcpjsonServers: arrOr(proj.enabledMcpjsonServers),
    disabledMcpjsonServers: arrOr(proj.disabledMcpjsonServers),
  };

  const links = linksResult
    ? {
        status: linksResult.status,
        missing: linksResult.missing,
        broken: linksResult.broken,
        overrides: linksResult.overrides,
      }
    : null;

  return {
    name: repo.name,
    repoPath,
    company,
    exists: true,
    claudeMd,
    settings,
    agents,
    skills,
    mcp,
    links,
    lastScannedAt,
  };
}

export function claudeMdPathFor(repoPath) {
  if (!repoPath) return null;
  const root = path.resolve(repoPath);
  const resolved = path.resolve(root, "CLAUDE.md");
  if (resolved !== path.join(root, "CLAUDE.md")) return null;
  if (!resolved.startsWith(root + path.sep)) return null;
  return resolved;
}

export async function readClaudeMdFor(repoPath) {
  const filePath = claudeMdPathFor(repoPath);
  if (!filePath) return null;
  const st = await statSafe(filePath);
  if (!st || !st.isFile()) return null;
  const content = await readFile(filePath, "utf8");
  return { content, mtime: st.mtime.toISOString(), path: filePath };
}

export class StaleClaudeMdError extends Error {
  constructor(currentMtime, currentContent) {
    super("stale");
    this.code = "STALE";
    this.currentMtime = currentMtime;
    this.currentContent = currentContent;
  }
}

export async function writeClaudeMdFor(repoPath, content, expectedMtime) {
  const filePath = claudeMdPathFor(repoPath);
  if (!filePath) {
    const err = new Error("path traversal rejected");
    err.code = "EBADPATH";
    throw err;
  }
  const existing = await statSafe(filePath);
  if (existing) {
    if (expectedMtime != null) {
      const expected = Date.parse(expectedMtime);
      if (
        !Number.isFinite(expected) ||
        Math.abs(existing.mtimeMs - expected) > 1
      ) {
        const currentContent = await readFile(filePath, "utf8");
        throw new StaleClaudeMdError(
          existing.mtime.toISOString(),
          currentContent,
        );
      }
    } else {
      const currentContent = await readFile(filePath, "utf8");
      throw new StaleClaudeMdError(
        existing.mtime.toISOString(),
        currentContent,
      );
    }
  } else if (expectedMtime != null) {
    throw new StaleClaudeMdError(null, "");
  }

  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmpPath, content, "utf8");
  await rename(tmpPath, filePath);
  const after = await stat(filePath);
  return {
    mtime: after.mtime.toISOString(),
    size: after.size,
    path: filePath,
  };
}
