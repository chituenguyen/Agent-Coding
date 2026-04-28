const BASE = '/api'

async function req(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || `HTTP ${res.status}`)
  }
  return res.json()
}

export const api = {
  // Queue
  getQueue: () => req('GET', '/queue'),
  addToQueue: (data) => req('POST', '/queue/add', data),
  clearQueue: (filter = 'done') => req('DELETE', `/queue/clear?filter=${filter}`),

  // Tasks
  getTasks: () => req('GET', '/tasks'),
  getTask: (project, taskId) => req('GET', `/tasks/${project}/${taskId}`),
  createTask: (data) => req('POST', '/tasks', data),
  deleteTask: (project, taskId) => req('DELETE', `/tasks/${project}/${taskId}`),

  // Settings
  getSettings: () => req('GET', '/settings'),
  saveSettings: (data) => req('PUT', '/settings', data),

  // MCP
  getMcp: () => req('GET', '/mcp'),
  upsertMcp: (scope, name, config) => req('PUT', `/mcp/${scope}/${encodeURIComponent(name)}`, config),
  deleteMcp: (scope, name) => req('DELETE', `/mcp/${scope}/${encodeURIComponent(name)}`),

  // Agents
  getAgents: () => req('GET', '/agents'),
  createAgent: (data) => req('POST', '/agents', data),
  updateAgent: (filename, data) => req('PUT', `/agents/${filename}`, data),
  deleteAgent: (filename) => req('DELETE', `/agents/${filename}`),

  // Skills
  getSkills: () => req('GET', '/skills'),
  createSkill: (data) => req('POST', '/skills', data),
  updateSkill: (dirname, data) => req('PUT', `/skills/${dirname}`, data),
  deleteSkill: (dirname) => req('DELETE', `/skills/${dirname}`),

  // Commands
  getCommands: () => req('GET', '/commands'),
  createCommand: (data) => req('POST', '/commands', data),
  updateCommand: (filename, data) => req('PUT', `/commands/${filename}`, data),
  deleteCommand: (filename) => req('DELETE', `/commands/${filename}`),

  // Prompt improvement
  improvePrompt: (description, mode) => req('POST', '/improve-prompt', { description, mode }),
}
