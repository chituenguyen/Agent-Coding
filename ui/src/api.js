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

  // Native folder picker
  browseFolder: (prompt) => req("POST", "/browse-folder", { prompt }),

  // Remote control
  getRemoteStatus: () => req("GET", "/remote/status"),
  enableRemote: () => req("POST", "/remote/enable"),
  disableRemote: () => req("POST", "/remote/disable"),

  // Account
  getAccount: () => req("GET", "/account"),

  // Usage
  getUsage: () => req("GET", "/usage"),

  // Uploads — accepts {filename, data (base64 or data URL), contentType}
  uploadAttachment: (data) => req("POST", "/uploads", data),

  // Chat
  getChats: (kind, companyId) => req("GET", `/chats${qs({ kind, companyId })}`),
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
};
