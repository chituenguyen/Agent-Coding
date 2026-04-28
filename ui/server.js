import express from 'express'
import { createServer } from 'http'
import { WebSocketServer } from 'ws'
import matter from 'gray-matter'
import { spawn } from 'child_process'
import { readdir, readFile, writeFile, mkdir, rm, stat } from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
// server.js lives in ui/, workspace is the parent
const WORKSPACE = path.resolve(__dirname, '..')

const app = express()
const server = createServer(app)
const wss = new WebSocketServer({ server, path: '/ws' })

app.use(express.json())

// Serve built frontend in production
if (existsSync(path.join(__dirname, 'dist'))) {
  app.use(express.static(path.join(__dirname, 'dist')))
}

// ─── helpers ────────────────────────────────────────────────────────────────

async function readIfExists(filePath) {
  if (!existsSync(filePath)) return null
  return readFile(filePath, 'utf8')
}

function deriveStatus(taskDir) {
  const has = (f) => existsSync(path.join(taskDir, f))
  if (has('commit.md')) return 'done'
  if (has('review/approval.md')) return 'approved'
  if (has('review/fix-log.md')) return 'fixed'
  if (has('review/issues.md')) return 'issues'
  if (has('review/backend-summary.md') || has('review/frontend-summary.md')) return 'coded'
  if (has('SPEC.md')) return 'planned'
  if (has('input.md')) return 'created'
  return 'unknown'
}

function parseInputMd(content) {
  const get = (key) => {
    const m = content.match(new RegExp(`\\*\\*${key}:\\*\\*\\s*(.+)`))
    return m ? m[1].trim() : ''
  }
  return {
    taskId: get('Task ID'),
    project: get('Project'),
    created: get('Created'),
    description: get('Description'),
    targetPath: get('Path'),
  }
}

// ─── tasks ──────────────────────────────────────────────────────────────────

app.get('/api/tasks', async (req, res) => {
  try {
    const tasksDir = path.join(WORKSPACE, 'tasks')
    if (!existsSync(tasksDir)) return res.json([])

    const projects = await readdir(tasksDir)
    const tasks = []

    for (const project of projects) {
      const projectDir = path.join(tasksDir, project)
      const s = await stat(projectDir)
      if (!s.isDirectory()) continue

      const taskIds = await readdir(projectDir)
      for (const taskId of taskIds) {
        const taskDir = path.join(projectDir, taskId)
        const ts = await stat(taskDir)
        if (!ts.isDirectory()) continue

        const inputContent = await readIfExists(path.join(taskDir, 'input.md'))
        const meta = inputContent ? parseInputMd(inputContent) : {}

        tasks.push({
          taskId,
          project,
          description: meta.description || taskId,
          created: meta.created || '',
          targetPath: meta.targetPath || '',
          status: deriveStatus(taskDir),
        })
      }
    }

    tasks.sort((a, b) => b.taskId.localeCompare(a.taskId))
    res.json(tasks)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/tasks/:project/:taskId', async (req, res) => {
  try {
    const { project, taskId } = req.params
    const taskDir = path.join(WORKSPACE, 'tasks', project, taskId)
    if (!existsSync(taskDir)) return res.status(404).json({ error: 'Task not found' })

    const inputContent = await readIfExists(path.join(taskDir, 'input.md'))
    const meta = inputContent ? parseInputMd(inputContent) : {}

    res.json({
      taskId,
      project,
      description: meta.description || taskId,
      created: meta.created || '',
      targetPath: meta.targetPath || '',
      status: deriveStatus(taskDir),
      files: {
        spec: await readIfExists(path.join(taskDir, 'SPEC.md')),
        approval: await readIfExists(path.join(taskDir, 'review/approval.md')),
        issues: await readIfExists(path.join(taskDir, 'review/issues.md')),
        fixLog: await readIfExists(path.join(taskDir, 'review/fix-log.md')),
        backendSummary: await readIfExists(path.join(taskDir, 'review/backend-summary.md')),
        frontendSummary: await readIfExists(path.join(taskDir, 'review/frontend-summary.md')),
        commit: await readIfExists(path.join(taskDir, 'commit.md')),
        input: inputContent,
      },
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.delete('/api/tasks/:project/:taskId', async (req, res) => {
  try {
    const { project, taskId } = req.params
    const taskDir = path.join(WORKSPACE, 'tasks', project, taskId)
    if (!existsSync(taskDir)) return res.status(404).json({ error: 'Task not found' })
    await rm(taskDir, { recursive: true })
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/tasks', async (req, res) => {
  try {
    const { description, targetPath } = req.body
    if (!description?.trim()) return res.status(400).json({ error: 'description required' })

    const project = targetPath
      ? path.basename(targetPath).toLowerCase().replace(/[^a-z0-9]+/g, '-')
      : 'workspace'

    const now = new Date()
    const pad = (n, l = 2) => String(n).padStart(l, '0')
    const dateStr = `${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}`
    const timeStr = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
    const descSlug = description.toLowerCase()
      .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50)
    const taskId = `${dateStr}-${timeStr}-${descSlug}`
    const taskDir = path.join(WORKSPACE, 'tasks', project, taskId)

    await mkdir(path.join(taskDir, 'code'), { recursive: true })
    await mkdir(path.join(taskDir, 'review'), { recursive: true })
    await mkdir(path.join(taskDir, 'research'), { recursive: true })

    // Create project context if new
    const contextPath = path.join(WORKSPACE, 'projects', project, 'context.md')
    if (!existsSync(contextPath)) {
      await mkdir(path.dirname(contextPath), { recursive: true })
      await writeFile(contextPath, `# Project Context: ${project}

**Repo path:** ${targetPath || 'N/A'}

## Tech Stack

<!-- Describe the tech stack, frameworks, languages used -->

## Coding Conventions

<!-- Naming conventions, file structure rules, patterns to follow -->

## Forbidden Patterns

<!-- Things agents must NOT do in this project -->

## Notes

<!-- Any other context agents should know before working on this project -->
`)
    }

    // Write input.md
    await writeFile(path.join(taskDir, 'input.md'), `# Task Input

**Task ID:** ${taskId}
**Project:** ${project}
**Created:** ${now.toISOString()}
**Description:** ${description}

## Target Repository

**Path:** ${targetPath || 'N/A'}
**Name:** ${targetPath ? path.basename(targetPath) : 'N/A'}

## Project Context

See: projects/${project}/context.md

## User's Request

${description}
`)

    // Write target-info.md if target provided
    if (targetPath) {
      await writeFile(path.join(taskDir, 'target-info.md'), `# Target Repository Info

**Path:** ${targetPath}
**Name:** ${path.basename(targetPath)}
**Project:** ${project}
**Project context:** projects/${project}/context.md
`)
    }

    res.json({ taskId, project, taskDir: `tasks/${project}/${taskId}` })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── queue ───────────────────────────────────────────────────────────────────

const queuePath = () => path.join(WORKSPACE, 'queue.json')

async function readQueue() {
  try {
    const raw = await readFile(queuePath(), 'utf8')
    return JSON.parse(raw)
  } catch {
    return { tasks: [] }
  }
}

async function writeQueue(data) {
  await writeFile(queuePath(), JSON.stringify(data, null, 2))
}

app.get('/api/queue', async (req, res) => {
  try {
    res.json(await readQueue())
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/queue/add', async (req, res) => {
  try {
    const { description, target, task_id, project } = req.body
    if (!description?.trim()) return res.status(400).json({ error: 'description required' })
    const queue = await readQueue()
    queue.tasks.push({
      description: description.trim(),
      target: target?.trim() || null,
      status: 'pending',
      // pre-populated when adding from an existing task → queue skips /create-task
      task_id: task_id || null,
      project: project || null,
      added_at: new Date().toISOString(),
      finished_at: null,
      error: null,
    })
    await writeQueue(queue)
    res.json({ success: true, position: queue.tasks.length })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.delete('/api/queue/clear', async (req, res) => {
  try {
    const { filter } = req.query // 'done' | 'failed' | 'all'
    const queue = await readQueue()
    if (filter === 'all') {
      queue.tasks = []
    } else if (filter === 'failed') {
      queue.tasks = queue.tasks.filter(t => t.status !== 'failed')
    } else {
      queue.tasks = queue.tasks.filter(t => t.status !== 'done')
    }
    await writeQueue(queue)
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── settings ────────────────────────────────────────────────────────────────

const GLOBAL_SETTINGS = path.join(process.env.HOME || process.env.USERPROFILE, '.claude/settings.json')

async function readSettings() {
  try { return JSON.parse(await readFile(GLOBAL_SETTINGS, 'utf8')) } catch { return {} }
}

app.get('/api/settings', async (req, res) => {
  try { res.json(await readSettings()) }
  catch (err) { res.status(500).json({ error: err.message }) }
})

app.put('/api/settings', async (req, res) => {
  try {
    const current = await readSettings()
    const merged = deepMerge(current, req.body)
    await writeFile(GLOBAL_SETTINGS, JSON.stringify(merged, null, 2))
    res.json({ success: true })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

function deepMerge(target, source) {
  const out = { ...target }
  for (const [k, v] of Object.entries(source)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && typeof target[k] === 'object')
      out[k] = deepMerge(target[k], v)
    else
      out[k] = v
  }
  return out
}

// ─── mcp ─────────────────────────────────────────────────────────────────────

const GLOBAL_CLAUDE_JSON = path.join(process.env.HOME || process.env.USERPROFILE, '.claude.json')
const PROJECT_MCP_JSON = path.join(WORKSPACE, '.mcp.json')

async function readGlobalClaude() {
  try { return JSON.parse(await readFile(GLOBAL_CLAUDE_JSON, 'utf8')) } catch { return {} }
}
async function writeGlobalClaude(data) {
  await writeFile(GLOBAL_CLAUDE_JSON, JSON.stringify(data, null, 2))
}
async function readProjectMcp() {
  try { return JSON.parse(await readFile(PROJECT_MCP_JSON, 'utf8')) } catch { return { mcpServers: {} } }
}
async function writeProjectMcp(data) {
  await writeFile(PROJECT_MCP_JSON, JSON.stringify(data, null, 2))
}

// GET both scopes
app.get('/api/mcp', async (req, res) => {
  try {
    const global = await readGlobalClaude()
    const project = await readProjectMcp()
    res.json({
      global: global.mcpServers || {},
      project: project.mcpServers || {},
    })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// PUT (upsert) a server in a scope
app.put('/api/mcp/:scope/:name', async (req, res) => {
  try {
    const { scope, name } = req.params
    const config = req.body
    if (scope === 'global') {
      const data = await readGlobalClaude()
      if (!data.mcpServers) data.mcpServers = {}
      data.mcpServers[name] = config
      await writeGlobalClaude(data)
    } else {
      const data = await readProjectMcp()
      if (!data.mcpServers) data.mcpServers = {}
      data.mcpServers[name] = config
      await writeProjectMcp(data)
    }
    res.json({ success: true })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// DELETE a server from a scope
app.delete('/api/mcp/:scope/:name', async (req, res) => {
  try {
    const { scope, name } = req.params
    if (scope === 'global') {
      const data = await readGlobalClaude()
      delete (data.mcpServers || {})[name]
      await writeGlobalClaude(data)
    } else {
      const data = await readProjectMcp()
      delete (data.mcpServers || {})[name]
      await writeProjectMcp(data)
    }
    res.json({ success: true })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ─── agents ─────────────────────────────────────────────────────────────────

const agentsDir = () => path.join(WORKSPACE, '.claude/agents')

app.get('/api/agents', async (req, res) => {
  try {
    const files = await readdir(agentsDir())
    const agents = await Promise.all(
      files.filter(f => f.endsWith('.md')).map(async (f) => {
        const raw = await readFile(path.join(agentsDir(), f), 'utf8')
        const { data, content } = matter(raw)
        return { filename: f.replace('.md', ''), ...data, body: content.trim() }
      })
    )
    res.json(agents)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/agents', async (req, res) => {
  try {
    const { filename, name, description, model, body } = req.body
    if (!filename) return res.status(400).json({ error: 'filename required' })
    const fm = {}
    if (name) fm.name = name
    if (description) fm.description = description
    if (model) fm.model = model
    const content = matter.stringify(body || '', fm)
    await writeFile(path.join(agentsDir(), `${filename}.md`), content)
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.put('/api/agents/:filename', async (req, res) => {
  try {
    const { name, description, model, body } = req.body
    const fm = {}
    if (name) fm.name = name
    if (description) fm.description = description
    if (model) fm.model = model
    const content = matter.stringify(body || '', fm)
    await writeFile(path.join(agentsDir(), `${req.params.filename}.md`), content)
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.delete('/api/agents/:filename', async (req, res) => {
  try {
    await rm(path.join(agentsDir(), `${req.params.filename}.md`))
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── skills ──────────────────────────────────────────────────────────────────

const skillsDir = () => path.join(WORKSPACE, '.claude/skills')

app.get('/api/skills', async (req, res) => {
  try {
    const entries = await readdir(skillsDir(), { withFileTypes: true })
    const skills = await Promise.all(
      entries.filter(e => e.isDirectory()).map(async (e) => {
        const skillFile = path.join(skillsDir(), e.name, 'SKILL.md')
        if (!existsSync(skillFile)) return null
        const raw = await readFile(skillFile, 'utf8')
        const { data, content } = matter(raw)
        return { dirname: e.name, ...data, body: content.trim() }
      })
    )
    res.json(skills.filter(Boolean))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/skills', async (req, res) => {
  try {
    const { dirname, name, description, userInvocable, body } = req.body
    if (!dirname) return res.status(400).json({ error: 'dirname required' })
    const skillDir = path.join(skillsDir(), dirname)
    await mkdir(skillDir, { recursive: true })
    const fm = {}
    if (name) fm.name = name
    if (description) fm.description = description
    if (userInvocable === false) fm['user-invocable'] = false
    const content = matter.stringify(body || '', fm)
    await writeFile(path.join(skillDir, 'SKILL.md'), content)
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.put('/api/skills/:dirname', async (req, res) => {
  try {
    const { name, description, userInvocable, body } = req.body
    const skillDir = path.join(skillsDir(), req.params.dirname)
    const fm = {}
    if (name) fm.name = name
    if (description) fm.description = description
    if (userInvocable === false) fm['user-invocable'] = false
    const content = matter.stringify(body || '', fm)
    await writeFile(path.join(skillDir, 'SKILL.md'), content)
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.delete('/api/skills/:dirname', async (req, res) => {
  try {
    await rm(path.join(skillsDir(), req.params.dirname), { recursive: true })
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── commands ────────────────────────────────────────────────────────────────

const commandsDir = () => path.join(WORKSPACE, '.claude/commands')

app.get('/api/commands', async (req, res) => {
  try {
    const files = await readdir(commandsDir())
    const commands = await Promise.all(
      files.filter(f => f.endsWith('.md')).map(async (f) => {
        const content = await readFile(path.join(commandsDir(), f), 'utf8')
        return { filename: f.replace('.md', ''), content }
      })
    )
    res.json(commands)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/commands', async (req, res) => {
  try {
    const { filename, content } = req.body
    if (!filename) return res.status(400).json({ error: 'filename required' })
    await writeFile(path.join(commandsDir(), `${filename}.md`), content || '')
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.put('/api/commands/:filename', async (req, res) => {
  try {
    await writeFile(path.join(commandsDir(), `${req.params.filename}.md`), req.body.content || '')
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.delete('/api/commands/:filename', async (req, res) => {
  try {
    await rm(path.join(commandsDir(), `${req.params.filename}.md`))
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── prompt improvement via claude ──────────────────────────────────────────

app.post('/api/improve-prompt', async (req, res) => {
  const { description, mode } = req.body // mode: 'task' | 'investigate'
  if (!description?.trim()) return res.status(400).json({ error: 'description required' })

  const context = mode === 'investigate'
    ? 'The user is describing a bug to investigate (find root cause).'
    : 'The user is describing a coding task for an AI agent (build, fix, refactor, etc.).'

  const systemPrompt = `You are a prompt quality assistant for a multi-agent coding system. ${context}

The user wrote this description:
"""
${description.trim()}
"""

Your job:
- If the description has enough context for an AI agent to act on, rewrite it as a clear, specific, technical description. Make it concise but complete — include what, where, and expected behavior if relevant.
- If critical information is missing (e.g. which feature, which error, which file/page/endpoint), ask 1-3 targeted clarifying questions. No more than 3.

Respond ONLY with valid JSON in this exact format:
{
  "action": "rewrite" | "ask",
  "result": "improved description string" | ["question 1", "question 2"],
  "explanation": "one short sentence on what you changed or what's missing"
}`

  try {
    // Escape for shell
    const escaped = systemPrompt.replace(/"/g, '\\"').replace(/\n/g, '\\n')
    const proc = spawn(
      `claude -p "${escaped}"`,
      [],
      { shell: true, cwd: WORKSPACE, env: process.env }
    )

    let stdout = ''
    let stderr = ''
    proc.stdout.on('data', chunk => { stdout += chunk.toString() })
    proc.stderr.on('data', chunk => { stderr += chunk.toString() })
    proc.on('close', (code) => {
      if (code !== 0) return res.status(500).json({ error: stderr || 'Claude exited with error' })
      // Extract JSON from response (Claude may wrap in markdown)
      const match = stdout.match(/\{[\s\S]*\}/)
      if (!match) return res.status(500).json({ error: 'Could not parse response', raw: stdout })
      try {
        const parsed = JSON.parse(match[0])
        res.json(parsed)
      } catch {
        res.status(500).json({ error: 'Invalid JSON from Claude', raw: stdout })
      }
    })
    proc.on('error', err => res.status(500).json({ error: err.message }))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Catch-all for React SPA (production)
app.get('*', (req, res) => {
  const indexPath = path.join(__dirname, 'dist/index.html')
  if (existsSync(indexPath)) {
    res.sendFile(indexPath)
  } else {
    res.status(404).send('Run "npm run build" first, or use "npm run dev".')
  }
})

// ─── websocket ───────────────────────────────────────────────────────────────

wss.on('connection', (ws) => {
  let currentProc = null

  ws.on('message', (raw) => {
    let msg
    try { msg = JSON.parse(raw) } catch { return }

    if (msg.action === 'run-workflow') {
      if (currentProc) { currentProc.kill('SIGINT'); currentProc = null }

      const { taskPath } = msg
      ws.send(JSON.stringify({ type: 'started', taskPath }))

      const proc = spawn(
        `claude -p "/workflow ${taskPath}"`,
        [],
        { shell: true, cwd: WORKSPACE, env: process.env }
      )
      currentProc = proc

      proc.stdout.on('data', (chunk) => {
        ws.send(JSON.stringify({ type: 'stdout', data: chunk.toString() }))
      })
      proc.stderr.on('data', (chunk) => {
        ws.send(JSON.stringify({ type: 'stderr', data: chunk.toString() }))
      })
      proc.on('close', (code) => {
        ws.send(JSON.stringify({ type: 'done', code }))
        currentProc = null
      })
      proc.on('error', (err) => {
        ws.send(JSON.stringify({ type: 'error', message: err.message }))
        currentProc = null
      })
    }

    if (msg.action === 'run-command') {
      if (currentProc) { currentProc.kill('SIGINT'); currentProc = null }

      const { command } = msg
      ws.send(JSON.stringify({ type: 'started', command }))

      const proc = spawn(
        `claude -p "${command.replace(/"/g, '\\"')}"`,
        [],
        { shell: true, cwd: WORKSPACE, env: process.env }
      )
      currentProc = proc

      proc.stdout.on('data', (chunk) => {
        ws.send(JSON.stringify({ type: 'stdout', data: chunk.toString() }))
      })
      proc.stderr.on('data', (chunk) => {
        ws.send(JSON.stringify({ type: 'stderr', data: chunk.toString() }))
      })
      proc.on('close', (code) => {
        ws.send(JSON.stringify({ type: 'done', code }))
        currentProc = null
      })
      proc.on('error', (err) => {
        ws.send(JSON.stringify({ type: 'error', message: err.message }))
        currentProc = null
      })
    }

    if (msg.action === 'stop') {
      if (currentProc) {
        currentProc.kill('SIGINT')
        currentProc = null
        ws.send(JSON.stringify({ type: 'stopped' }))
      }
    }
  })

  ws.on('close', () => {
    if (currentProc) { currentProc.kill('SIGINT'); currentProc = null }
  })
})

const PORT = process.env.PORT || 3001
server.listen(PORT, () => {
  console.log(`Agent Coding UI → http://localhost:${PORT}`)
  console.log(`Workspace: ${WORKSPACE}`)
})
