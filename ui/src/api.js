const BASE = "/api";

async function req(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json();
}

function qs(params) {
  const entries = Object.entries(params || {}).filter(
    ([, v]) => v !== undefined && v !== null && v !== "",
  );
  return entries.length
    ? "?" + entries.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&")
    : "";
}

export const api = {
  // Queue
  getQueue: (companyId) => req("GET", `/queue${qs({ companyId })}`),
  addToQueue: (data) => req("POST", "/queue/add", data),
  addFixToQueue: (project, taskId, fixId, fixPath, description) =>
    req("POST", "/queue/add", {
      description,
      type: "fix",
      task_path: `tasks/${project}/${taskId}`,
      fix_path: fixPath,
    }),
  addSubtaskToQueue: (project, taskId, subtaskId, subtaskPath, description) =>
    req("POST", "/queue/add", {
      description,
      type: "subtask",
      task_path: `tasks/${project}/${taskId}`,
      subtask_path: subtaskPath,
    }),
  clearQueue: (filter = "done") =>
    req("DELETE", `/queue/clear?filter=${filter}`),
  reorderQueue: (fromIndex, toIndex) =>
    req("POST", "/queue/reorder", { fromIndex, toIndex }),
  retryQueue: (index) => req("POST", "/queue/retry", { index }),
  cancelQueue: () => req("POST", "/queue/cancel"),
  removeQueue: (index) => req("DELETE", "/queue/remove", { index }),

  // Tasks
  getTasks: (companyId) => req("GET", `/tasks${qs({ companyId })}`),
  getTask: (project, taskId) => req("GET", `/tasks/${project}/${taskId}`),
  createTask: (data) => req("POST", "/tasks", data),
  deleteTask: (project, taskId) => req("DELETE", `/tasks/${project}/${taskId}`),
  // Fixes (bug fixes on completed tasks)
  createFix: (project, taskId, data) =>
    req("POST", `/tasks/${project}/${taskId}/fixes`, data),
  getFixes: (project, taskId) =>
    req("GET", `/tasks/${project}/${taskId}/fixes`),
  // Sub-tasks (related tasks on completed tasks)
  createSubtask: (project, taskId, data) =>
    req("POST", `/tasks/${project}/${taskId}/subtasks`, data),
  getSubtasks: (project, taskId) =>
    req("GET", `/tasks/${project}/${taskId}/subtasks`),
  deleteFix: (project, taskId, fixId) =>
    req("DELETE", `/tasks/${project}/${taskId}/fixes/${fixId}`),
  deleteSubtask: (project, taskId, subtaskId) =>
    req("DELETE", `/tasks/${project}/${taskId}/subtasks/${subtaskId}`),
  resetFix: (project, taskId, fixId) =>
    req("POST", `/tasks/${project}/${taskId}/fixes/${fixId}/reset`),
  resetSubtask: (project, taskId, subtaskId) =>
    req("POST", `/tasks/${project}/${taskId}/subtasks/${subtaskId}/reset`),

  // Workspace name (gitignored file at workspace root)
  getWorkspaceName: () => req("GET", "/workspace-name"),
  setWorkspaceName: (name) => req("PUT", "/workspace-name", { name }),

  // Models
  getModels: () => req("GET", "/models"),

  // Settings
  getSettings: () => req("GET", "/settings"),
  saveSettings: (data) => req("PUT", "/settings", data),

  // MCP
  getMcp: () => req("GET", "/mcp"),
  upsertMcp: (scope, name, config) =>
    req("PUT", `/mcp/${scope}/${encodeURIComponent(name)}`, config),
  deleteMcp: (scope, name) =>
    req("DELETE", `/mcp/${scope}/${encodeURIComponent(name)}`),

  // Agents
  getAgents: () => req("GET", "/agents"),
  createAgent: (data) => req("POST", "/agents", data),
  updateAgent: (filename, data) => req("PUT", `/agents/${filename}`, data),
  deleteAgent: (filename) => req("DELETE", `/agents/${filename}`),

  // Skills
  getSkills: () => req("GET", "/skills"),
  createSkill: (data) => req("POST", "/skills", data),
  updateSkill: (dirname, data) => req("PUT", `/skills/${dirname}`, data),
  deleteSkill: (dirname) => req("DELETE", `/skills/${dirname}`),

  // Commands
  getCommands: () => req("GET", "/commands"),
  createCommand: (data) => req("POST", "/commands", data),
  updateCommand: (filename, data) => req("PUT", `/commands/${filename}`, data),
  deleteCommand: (filename) => req("DELETE", `/commands/${filename}`),

  // MCP Catalog
  getCatalog: () => req("GET", "/catalog"),
  upsertCatalog: (item) => req("POST", "/catalog", item),
  deleteCatalog: (name) =>
    req("DELETE", `/catalog/${encodeURIComponent(name)}`),

  // Repositories (per-project MCP)
  getRepositories: () => req("GET", "/repositories"),
  createRepository: (data) => req("POST", "/repositories", data),
  deleteRepository: (name) =>
    req("DELETE", `/repositories/${encodeURIComponent(name)}`),
  getRepoMcp: (project) => req("GET", `/repositories/${project}/mcp`),
  upsertRepoMcp: (project, name, config) =>
    req(
      "PUT",
      `/repositories/${project}/mcp/${encodeURIComponent(name)}`,
      config,
    ),
  deleteRepoMcp: (project, name) =>
    req("DELETE", `/repositories/${project}/mcp/${encodeURIComponent(name)}`),
  getRepoGraph: (project) => req("GET", `/repositories/${project}/graph`),
  indexRepoGraph: (project) =>
    req("POST", `/repositories/${project}/graph/index`),

  // Repo Health (per-repo CLAUDE/MCP/agents/skills/settings snapshot)
  getRepoHealth: (name) =>
    req("GET", `/repositories/${encodeURIComponent(name)}/health`),
  getRepoLinkStatus: (name) =>
    req("GET", `/repositories/${encodeURIComponent(name)}/link-status`),
  repairRepoLinks: (name, opts) =>
    req(
      "POST",
      `/repositories/${encodeURIComponent(name)}/repair-links`,
      opts || {},
    ),
  getRepoClaudeMd: async (name) => {
    const res = await fetch(
      `${BASE}/repositories/${encodeURIComponent(name)}/claude-md`,
    );
    let body = null;
    try {
      body = await res.json();
    } catch {
      /* empty */
    }
    if (res.status === 404) {
      const err = new Error("not_found");
      err.status = 404;
      err.body = body || {};
      throw err;
    }
    if (!res.ok) {
      throw new Error((body && body.error) || `HTTP ${res.status}`);
    }
    return body;
  },
  putRepoClaudeMd: async (name, { content, expectedMtime }) => {
    const res = await fetch(
      `${BASE}/repositories/${encodeURIComponent(name)}/claude-md`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, expectedMtime }),
      },
    );
    let body = null;
    try {
      body = await res.json();
    } catch {
      /* empty body */
    }
    if (res.status === 409) {
      const err = new Error("stale");
      err.status = 409;
      err.body = body || {};
      throw err;
    }
    if (!res.ok) {
      throw new Error((body && body.error) || `HTTP ${res.status}`);
    }
    return body;
  },

  // Native folder picker
  browseFolder: (prompt) => req("POST", "/browse-folder", { prompt }),

  // Folder picker — remote fallback
  validatePath: (p) => req("POST", "/fs/validate-path", { path: p }),
  getRecentPaths: () => req("GET", "/fs/recent-paths"),

  // Remote control
  getRemoteStatus: () => req("GET", "/remote/status"),
  enableRemote: () => req("POST", "/remote/enable"),
  disableRemote: () => req("POST", "/remote/disable"),

  // Account
  getAccount: () => req("GET", "/account"),

  // Usage
  getUsage: () => req("GET", "/usage"),

  // Monitor (abtop)
  checkMonitor: () => req("GET", "/monitor/check"),
  getMonitorSnapshot: () => req("GET", "/monitor/snapshot"),
  installMonitor: ({ onLog, onDone } = {}) => {
    const ctrl = new AbortController();
    (async () => {
      try {
        const resp = await fetch(BASE + "/monitor/install", {
          method: "POST",
          signal: ctrl.signal,
        });
        if (!resp.ok) {
          let msg = `HTTP ${resp.status}`;
          try {
            const j = await resp.json();
            msg = j.error || msg;
          } catch {
            /* noop */
          }
          onDone?.({ ok: false, code: -1, error: msg });
          return;
        }
        const reader = resp.body.getReader();
        const dec = new TextDecoder();
        let buf = "";
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let idx;
          while ((idx = buf.indexOf("\n\n")) >= 0) {
            const raw = buf.slice(0, idx);
            buf = buf.slice(idx + 2);
            let event = "message";
            let data = "";
            for (const line of raw.split("\n")) {
              if (line.startsWith("event:")) event = line.slice(6).trim();
              else if (line.startsWith("data:")) data += line.slice(5).trim();
            }
            if (!data) continue;
            let parsed;
            try {
              parsed = JSON.parse(data);
            } catch {
              continue;
            }
            if (event === "log") onLog?.(parsed);
            else if (event === "done") onDone?.(parsed);
          }
        }
      } catch (e) {
        if (e.name !== "AbortError") {
          onDone?.({ ok: false, code: -1, error: e.message || String(e) });
        }
      }
    })();
    return () => ctrl.abort();
  },

  // Uploads — accepts {filename, data (base64 or data URL), contentType}
  uploadAttachment: (data) => req("POST", "/uploads", data),

  // Memory recall
  recall: ({ q, file, project, limit = 5 } = {}) =>
    req("GET", `/memory/recall${qs({ q, file, project, limit })}`),

  // Chat
  getChats: (kind, companyId, teamId) =>
    req("GET", `/chats${qs({ kind, companyId, teamId })}`),
  createChat: (data) => req("POST", "/chats", data || {}),
  getChat: (id) => req("GET", `/chats/${id}`),
  renameChat: (id, title) => req("PATCH", `/chats/${id}`, { title }),
  updateChat: (id, patch) => req("PATCH", `/chats/${id}`, patch),
  deleteChat: (id) => req("DELETE", `/chats/${id}`),

  // Companies / rooms / teams
  getCompanies: () => req("GET", "/companies"),
  getCompany: (id) => req("GET", `/companies/${id}`),
  createCompany: (data) => req("POST", "/companies", data),
  updateCompany: (id, data) => req("PATCH", `/companies/${id}`, data),
  deleteCompany: (id) => req("DELETE", `/companies/${id}`),
  updateTeam: (companyId, teamId, data) =>
    req("PATCH", `/companies/${companyId}/teams/${teamId}`, data),
  addTeam: (companyId, roomId, data) =>
    req("POST", `/companies/${companyId}/rooms/${roomId}/teams`, data),
  deleteTeam: (companyId, roomId, teamId) =>
    req("DELETE", `/companies/${companyId}/rooms/${roomId}/teams/${teamId}`),
  addRoom: (companyId, data) =>
    req("POST", `/companies/${companyId}/rooms`, data),
  deleteRoom: (companyId, roomId) =>
    req("DELETE", `/companies/${companyId}/rooms/${roomId}`),

  // Room designer — streams NDJSON. onChunk(text) is called with raw stdout
  // fragments as Claude generates; resolves with the parsed final result.
  startRoomDesign: async (companyId, description, onChunk) => {
    const res = await fetch(
      `${BASE}/companies/${companyId}/rooms/design/start`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description }),
      },
    );
    if (!res.ok) throw new Error(await res.text());
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    let final = null;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop();
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const evt = JSON.parse(line);
          if (evt.chunk && onChunk) onChunk(evt.chunk);
          if (evt.done) final = evt.result;
          if (evt.error) throw new Error(evt.error);
        } catch (err) {
          if (err.message?.startsWith("Unexpected")) continue;
          throw err;
        }
      }
    }
    if (!final) throw new Error("Designer returned no result");
    return final;
  },
  regenRoomAgent: (companyId, currentRoom, teamId, instructions) =>
    req("POST", `/companies/${companyId}/rooms/design/regen-agent`, {
      currentRoom,
      teamId,
      instructions,
    }),
  checkStaleRoomAgents: (
    companyId,
    currentRoom,
    editedTeamId,
    previousAgentDef,
  ) =>
    req("POST", `/companies/${companyId}/rooms/design/check-stale`, {
      currentRoom,
      editedTeamId,
      previousAgentDef,
    }),
  finalizeRoom: (companyId, data) =>
    req("POST", `/companies/${companyId}/rooms/design/finalize`, data),
};
