import { useEffect, useState, useCallback } from "react";
import { api } from "../api";

function computeStatus({ isConnector, disabledList, name }) {
  if (isConnector) return "connector";
  if (disabledList?.includes(name)) return "disabled";
  return "active";
}

function slugify(s) {
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function buildGlobalSection(apiMcp) {
  const globalMap = apiMcp.global || {};
  const servers = Object.entries(globalMap).map(([name, config]) => ({
    name,
    config,
    scope: "global",
    status: "active",
  }));
  const connectors = (apiMcp.connectors || []).map((c) => ({
    name: c.name,
    rawLabel: c.rawLabel,
    source: c.source,
    status: "connector",
  }));
  return { servers, connectors };
}

function buildRepoServers({ repoMcp, projectState }) {
  const entries = repoMcp?.mcpServers ? Object.entries(repoMcp.mcpServers) : [];
  const disabledList = [
    ...(projectState?.disabledMcpServers || []),
    ...(projectState?.disabledMcpjsonServers || []),
  ];
  return entries.map(([name, config]) => ({
    name,
    config,
    scope: "repo",
    status: computeStatus({ isConnector: false, disabledList, name }),
  }));
}

export function useMcpData() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [apiMcp, apiRepos] = await Promise.all([
        api.getMcp(),
        api.getRepositories(),
      ]);

      const perRepoMcpEntries = await Promise.all(
        apiRepos.map(async (r) => {
          try {
            const d = await api.getRepoMcp(r.name);
            return [r.name, d || {}];
          } catch {
            return [r.name, {}];
          }
        }),
      );
      const perRepoMcp = Object.fromEntries(perRepoMcpEntries);

      const perProjectState = apiMcp.perProjectState || {};

      const companiesMap = new Map();
      const unaffiliated = [];

      for (const repo of apiRepos) {
        const projectState = perProjectState[repo.repoPath];
        const servers = buildRepoServers({
          repoMcp: perRepoMcp[repo.name],
          projectState,
        });
        const enriched = {
          name: repo.name,
          path: repo.repoPath,
          mcpServerCount: repo.mcpServerCount ?? servers.length,
          servers,
        };

        if (!repo.company) {
          unaffiliated.push(enriched);
        } else {
          const cid = repo.company.id;
          if (!companiesMap.has(cid)) {
            companiesMap.set(cid, {
              id: cid,
              name: repo.company.name,
              accent: repo.company.accent,
              repos: [],
            });
          }
          companiesMap.get(cid).repos.push(enriched);
        }
      }

      const global = buildGlobalSection(apiMcp);

      setData({
        global,
        companies: Array.from(companiesMap.values()),
        unaffiliated,
        rawState: perProjectState,
        slug: slugify,
      });
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  return { data, loading, error, refetch: fetchAll };
}

export { slugify, computeStatus };
