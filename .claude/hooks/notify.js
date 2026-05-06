#!/usr/bin/env node
// SubagentStop / Stop hook — emits a macOS notification when an agent finishes.
// Also appends an audit line to .claude/hooks/notifications.log.

const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

let payload = {}
try { payload = JSON.parse(fs.readFileSync(0, 'utf8')) } catch {}

const event = process.env.CLAUDE_HOOK_EVENT || 'Stop'
const session = (payload.session_id || '').slice(0, 8)
const subagent = payload.subagent_type || payload.tool_input?.subagent_type || null

const title = subagent ? `Agent: ${subagent}` : 'Claude session'
const body = subagent
  ? `${subagent} finished${session ? ` (${session})` : ''}`
  : `Session ${session || 'main'} finished`

// macOS notification (silent on other platforms)
if (process.platform === 'darwin') {
  try {
    const safe = (s) => String(s).replace(/"/g, '\\"')
    execSync(
      `osascript -e 'display notification "${safe(body)}" with title "${safe(title)}" sound name "Glass"'`,
      { stdio: 'ignore', timeout: 2000 }
    )
  } catch { /* ignore */ }
}

try {
  const logFile = path.join(__dirname, 'notifications.log')
  fs.appendFileSync(logFile, `${new Date().toISOString()} [${event}] ${title} — ${body}\n`)
} catch { /* ignore */ }

process.exit(0)
