import { readFile, writeFile, readdir, stat } from "fs/promises";
import { existsSync } from "fs";
import path from "path";

import { WORKSPACE, mcpServerPath, PROJECT_MCP_JSON } from "./paths.js";

export async function readMcpServer() {
  try {
    return JSON.parse(await readFile(mcpServerPath, "utf8"));
  } catch {
    return { repositories: [], catalog: [] };
  }
}

export async function writeMcpServer(data) {
  await writeFile(mcpServerPath, JSON.stringify(data, null, 2) + "\n");
}

export async function readProjectMcpConfig(project) {
  const data = await readMcpServer();
  const repo = (data.repositories || []).find((r) => r.name === project);
  if (repo) return { mcpServers: repo.mcpServers || {} };
  // fallback: read legacy projects/<name>/mcp.json
  try {
    return JSON.parse(
      await readFile(
        path.join(WORKSPACE, "projects", project, "mcp.json"),
        "utf8",
      ),
    );
  } catch {
    return { mcpServers: {} };
  }
}

export async function writeProjectMcpConfig(project, mcpServers) {
  const data = await readMcpServer();
  const repo = (data.repositories || []).find((r) => r.name === project);
  if (repo) {
    repo.mcpServers = mcpServers;
    await writeMcpServer(data);
    // sync .mcp.json for the workspace repo so Claude Code picks up changes
    if (repo.path === WORKSPACE) {
      const dotMcp = {
        mcpServers: Object.fromEntries(
          Object.entries(mcpServers).map(([k, v]) => {
            const { type, ...rest } = v;
            return [k, rest];
          }),
        ),
      };
      await writeFile(
        path.join(WORKSPACE, ".mcp.json"),
        JSON.stringify(dotMcp, null, 2) + "\n",
      );
    }
    // sync projects/{name}/mcp.json so claude CLI --mcp-config still works for workflows
    const legacyPath = path.join(WORKSPACE, "projects", project, "mcp.json");
    if (existsSync(path.dirname(legacyPath))) {
      await writeFile(
        legacyPath,
        JSON.stringify({ mcpServers }, null, 2) + "\n",
      );
    }
  }
}

export async function migrateProjectMcpFiles() {
  const data = await readMcpServer();
  let changed = false;
  for (const repo of data.repositories || []) {
    if (repo.mcpServers) continue;
    // workspace repo: read from .mcp.json
    if (repo.path === WORKSPACE) {
      try {
        const dotMcp = JSON.parse(
          await readFile(path.join(WORKSPACE, ".mcp.json"), "utf8"),
        );
        repo.mcpServers = Object.fromEntries(
          Object.entries(dotMcp.mcpServers || {}).map(([k, v]) => [
            k,
            { type: "stdio", ...v },
          ]),
        );
        changed = true;
      } catch {
        repo.mcpServers = {};
      }
    } else {
      const legacyPath = path.join(
        WORKSPACE,
        "projects",
        repo.name,
        "mcp.json",
      );
      try {
        const legacy = JSON.parse(await readFile(legacyPath, "utf8"));
        repo.mcpServers = legacy.mcpServers || {};
        changed = true;
      } catch {
        repo.mcpServers = {};
      }
    }
  }
  if (changed) await writeMcpServer(data);
}

export async function getRepos() {
  const data = await readMcpServer();
  // Migrate from old repositories.json if mcp_server.json has no repos yet
  if (!data.repositories || data.repositories.length === 0) {
    const oldPath = path.join(WORKSPACE, "repositories.json");
    if (existsSync(oldPath)) {
      try {
        data.repositories = JSON.parse(await readFile(oldPath, "utf8"));
        await writeMcpServer(data);
      } catch {
        data.repositories = [];
      }
    } else {
      // Scan projects/ dir as fallback
      const projectsDir = path.join(WORKSPACE, "projects");
      if (existsSync(projectsDir)) {
        const dirs = await readdir(projectsDir);
        data.repositories = [];
        for (const name of dirs) {
          const s = await stat(path.join(projectsDir, name));
          if (!s.isDirectory()) continue;
          let repoPath = "";
          const contextFile = path.join(projectsDir, name, "context.md");
          if (existsSync(contextFile)) {
            const content = await readFile(contextFile, "utf8");
            const m = content.match(/\*\*Repo path:\*\*\s*(.+)/);
            if (m && m[1].trim() !== "N/A") repoPath = m[1].trim();
          }
          data.repositories.push({
            name,
            path: repoPath,
            addedAt: new Date().toISOString(),
          });
        }
        await writeMcpServer(data);
      }
    }
  }
  return data.repositories || [];
}

export async function readProjectMcp() {
  try {
    return JSON.parse(await readFile(PROJECT_MCP_JSON, "utf8"));
  } catch {
    return { mcpServers: {} };
  }
}

export async function writeProjectMcp(data) {
  await writeFile(PROJECT_MCP_JSON, JSON.stringify(data, null, 2));
}
