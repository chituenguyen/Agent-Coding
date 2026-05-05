import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'

const plainDescription = (desc = '') => desc.replace(/<\/?[\w_]+>/g, '').replace(/\n+/g, ' ').trim()

const STATUS_CONFIG = {
  pending: { label: 'Pending',  cls: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300',    icon: '○' },
  running: { label: 'Running',  cls: 'bg-yellow-100 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-300', icon: '▶' },
  done:    { label: 'Done',     cls: 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300',   icon: '✓' },
  failed:  { label: 'Failed',   cls: 'bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300',       icon: '✗' },
}

export default function Queue() {
  const [queue, setQueue] = useState({ tasks: [] })
  const [loading, setLoading] = useState(true)
  const [showClearMenu, setShowClearMenu] = useState(false)
  const [collapsed, setCollapsed] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem('queue-collapsed') || '[]')) }
    catch { return new Set() }
  })
  const pollRef = useRef(null)
  const navigate = useNavigate()

  function toggleCollapse(key) {
    setCollapsed(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      try { localStorage.setItem('queue-collapsed', JSON.stringify([...next])) } catch {}
      return next
    })
  }
  const isCollapsed = (key) => collapsed.has(key)

  async function load() {
    try {
      setQueue(await api.getQueue())
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  // Poll while queue has pending or running items
  useEffect(() => {
    const hasActive = queue.tasks.some(t => t.status === 'running' || t.status === 'pending')
    if (hasActive && !pollRef.current) {
      pollRef.current = setInterval(load, 3000)
    } else if (!hasActive && pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
    return () => {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
    }
  }, [queue.tasks])

  async function handleClear(filter) {
    setShowClearMenu(false)
    await api.clearQueue(filter)
    load()
  }

  const tasks = queue.tasks || []

  // Helper: extract project name from queue item
  const getProject = (t) => {
    if (t.project) return t.project
    const parts = (t.task_path || '').split('/')
    return parts.length >= 2 ? parts[1] : null
  }

  // Group: running first, then pending (queue order = execution priority), then done/failed (grouped by repo)
  const running = tasks.filter(t => t.status === 'running')
  const pending = tasks.map((t, i) => ({ ...t, _idx: i })).filter(t => t.status === 'pending')
  const completed = tasks.filter(t => t.status === 'done' || t.status === 'failed')
    .sort((a, b) => (b.finished_at || b.added_at || '').localeCompare(a.finished_at || a.added_at || ''))

  // Group completed by project
  const completedByProject = {}
  for (const t of completed) {
    const proj = getProject(t) || 'other'
    if (!completedByProject[proj]) completedByProject[proj] = []
    completedByProject[proj].push(t)
  }
  const projectNames = Object.keys(completedByProject).sort()

  const counts = {
    pending: pending.length,
    running: running.length,
    done:    tasks.filter(t => t.status === 'done').length,
    failed:  tasks.filter(t => t.status === 'failed').length,
  }

  function navTo(task) {
    if (task.type === 'fix' || task.type === 'subtask') {
      // Extract project/taskId from task_path (e.g. "tasks/league-of-legend/20260428-...")
      const parts = task.task_path?.split('/')
      if (parts?.length >= 3) {
        const project = parts[1]
        const taskId = parts[2]
        const tab = task.type === 'fix' ? 'fixes' : 'subtasks'
        navigate(`/tasks?project=${project}&task=${taskId}&tab=${tab}`)
      }
    } else if (task.project && task.task_id) {
      navigate(`/tasks?project=${task.project}&task=${task.task_id}&tab=overview`)
    }
  }

  function getTrackPath(task) {
    return task.fix_path || task.subtask_path || task.task_path || `tasks/${task.project}/${task.task_id}`
  }

  async function handleCancel() {
    if (!confirm('Cancel the running task?')) return
    try { await api.cancelQueue(); load() } catch (err) { alert('Failed: ' + err.message) }
  }

  async function handleRetry(index) {
    try { await api.retryQueue(index); load() } catch (err) { alert('Failed: ' + err.message) }
  }

  async function handleRemove(index) {
    if (!confirm('Remove this item from queue?')) return
    try { await api.removeQueue(index); load() } catch (err) { alert('Failed: ' + err.message) }
  }

  async function handleMove(queueIndex, direction) {
    const targetIndex = direction === 'up' ? queueIndex - 1 : queueIndex + 1
    if (targetIndex < 0 || targetIndex >= tasks.length) return
    // Don't swap with running items
    if (tasks[targetIndex].status === 'running') return
    try {
      await api.reorderQueue(queueIndex, targetIndex)
      load()
    } catch { }
  }

  return (
    <div className="p-8 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Queue</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            {loading ? '...' : `${tasks.length} items · ${counts.pending} pending${counts.running ? ` · ${counts.running} running` : ''} · ${counts.done} done${counts.failed ? ` · ${counts.failed} failed` : ''}`}
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
            Auto-processes pending items every 5s · One at a time
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Clear menu */}
          {tasks.length > 0 && (
            <div className="relative">
              <button
                onClick={() => setShowClearMenu(v => !v)}
                className="px-3 py-2 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 rounded-lg transition-colors"
              >
                Clear ▾
              </button>
              {showClearMenu && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowClearMenu(false)} />
                  <div className="absolute right-0 top-full mt-1 z-20 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1 min-w-36">
                    {counts.done > 0 && (
                      <button onClick={() => handleClear('done')} className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800">
                        Clear done ({counts.done})
                      </button>
                    )}
                    {counts.failed > 0 && (
                      <button onClick={() => handleClear('failed')} className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800">
                        Clear failed ({counts.failed})
                      </button>
                    )}
                    <button onClick={() => handleClear('all')} className="w-full text-left px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950">
                      Clear all
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Task list */}
      {loading ? (
        <div className="flex items-center gap-2 text-gray-400 dark:text-gray-500 text-sm py-8">
          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
          </svg>
          Loading queue...
        </div>
      ) : tasks.length === 0 ? (
        <div className="text-center py-20 text-gray-400 dark:text-gray-500">
          <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-gray-300 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M4 6h16M4 10h16M4 14h16M4 18h16" />
            </svg>
          </div>
          <p className="font-medium text-gray-600 dark:text-gray-300">Queue is empty</p>
          <p className="text-sm mt-1">Add tasks, bug fixes, or sub-tasks from the Tasks page — they'll be processed automatically</p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Running */}
          {running.length > 0 && (
            <div>
              <h2 className="text-xs font-semibold text-yellow-600 dark:text-yellow-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
                Running
              </h2>
              <div className="space-y-1.5">
                {running.map((task, i) => (
                  <div key={'r' + i}>
                    <QueueRow task={task} onNavigate={() => navTo(task)}
                      showCancel onCancel={handleCancel} />
                    <RunningTerminal trackPath={getTrackPath(task)} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Pending — in queue order (execution priority), grouped by project */}
          {pending.length > 0 && (() => {
            const pendingByProject = {}
            for (const t of pending) {
              const proj = getProject(t) || 'other'
              if (!pendingByProject[proj]) pendingByProject[proj] = []
              pendingByProject[proj].push(t)
            }
            const pendingProjects = Object.keys(pendingByProject).sort()
            return (
              <div>
                <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
                  Pending ({pending.length})
                </h2>
                <div className="space-y-4">
                  {pendingProjects.map(proj => {
                    const key = `pending:${proj}`
                    const open = !isCollapsed(key)
                    return (
                      <div key={proj}>
                        <button
                          type="button"
                          onClick={() => toggleCollapse(key)}
                          className="w-full flex items-center gap-2 mb-1.5 hover:text-gray-900 dark:hover:text-white text-gray-500 dark:text-gray-400 transition-colors group"
                        >
                          <svg className={`w-3 h-3 transition-transform shrink-0 ${open ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                          </svg>
                          <span className="text-xs font-medium uppercase tracking-wider">{proj}</span>
                          <span className="text-xs text-gray-400 dark:text-gray-500">{pendingByProject[proj].length}</span>
                        </button>
                        {open && (
                          <div className="space-y-1.5">
                            {pendingByProject[proj].map((task) => {
                              const pi = pending.indexOf(task)
                              return (
                                <QueueRow key={'p' + pi} task={task} onNavigate={() => navTo(task)}
                                  showReorder
                                  isFirst={pi === 0}
                                  isLast={pi === pending.length - 1}
                                  onMoveUp={() => handleMove(task._idx, 'up')}
                                  onMoveDown={() => handleMove(task._idx, 'down')}
                                  position={pi + 1}
                                  showActions
                                  onRemove={() => handleRemove(task._idx)}
                                />
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })()}

          {/* Completed — grouped by project */}
          {completed.length > 0 && (
            <div>
              <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
                Completed ({completed.length})
              </h2>
              <div className="space-y-4">
                {projectNames.map(proj => {
                  const key = `completed:${proj}`
                  const open = !isCollapsed(key)
                  return (
                    <div key={proj}>
                      <button
                        type="button"
                        onClick={() => toggleCollapse(key)}
                        className="w-full flex items-center gap-2 mb-1.5 hover:text-gray-900 dark:hover:text-white text-gray-500 dark:text-gray-400 transition-colors group"
                      >
                        <svg className={`w-3 h-3 transition-transform shrink-0 ${open ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                        </svg>
                        <span className="text-xs font-medium uppercase tracking-wider">{proj}</span>
                        <span className="text-xs text-gray-400 dark:text-gray-500">{completedByProject[proj].length}</span>
                      </button>
                      {open && (
                        <div className="space-y-1.5">
                          {completedByProject[proj].map((task, i) => {
                            const qIdx = tasks.indexOf(task)
                            return (
                              <QueueRow key={`${proj}-${i}`} task={task} onNavigate={() => navTo(task)}
                                showActions={task.status === 'failed'}
                                onRetry={() => handleRetry(qIdx)}
                                onRemove={() => handleRemove(qIdx)}
                              />
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const TYPE_CONFIG = {
  fix:         { label: 'Bug Fix',      cls: 'bg-orange-100 dark:bg-orange-900 text-orange-700 dark:text-orange-300' },
  subtask:     { label: 'Sub-task',     cls: 'bg-violet-100 dark:bg-violet-900 text-violet-700 dark:text-violet-300' },
  investigate: { label: 'Investigate',  cls: 'bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300' },
  task:        { label: 'Task',         cls: 'bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300' },
}

function QueueRow({ task, onNavigate, showReorder, isFirst, isLast, onMoveUp, onMoveDown, position, showCancel, onCancel, showActions, onRetry, onRemove }) {
  const cfg = STATUS_CONFIG[task.status] ?? STATUS_CONFIG.pending
  const typeCfg = TYPE_CONFIG[task.type] || TYPE_CONFIG.task
  const parentId = task.task_path?.split('/').pop()

  return (
    <div className={`rounded-lg border transition-all bg-white dark:bg-gray-900
      ${task.status === 'running' ? 'border-yellow-300 dark:border-yellow-700 bg-yellow-50/30 dark:bg-yellow-900/20' :
        task.status === 'failed' ? 'border-red-200 dark:border-red-900' :
        'border-gray-200 dark:border-gray-700 hover:border-indigo-300 dark:hover:border-indigo-700 hover:shadow-sm'}`}
    >
      <div className="flex items-start gap-3 px-4 py-3 cursor-pointer" onClick={onNavigate}>
        {/* Reorder buttons or status icon */}
        {showReorder ? (
          <div className="flex flex-col items-center gap-0.5 shrink-0 mt-0.5">
            <button onClick={e => { e.stopPropagation(); onMoveUp?.() }} disabled={isFirst}
              className="p-0.5 text-gray-300 dark:text-gray-600 hover:text-indigo-500 dark:hover:text-indigo-400 disabled:opacity-20 disabled:cursor-not-allowed transition-colors" title="Move up">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
            </button>
            <span className="text-xs font-mono text-gray-400 dark:text-gray-500 leading-none">{position}</span>
            <button onClick={e => { e.stopPropagation(); onMoveDown?.() }} disabled={isLast}
              className="p-0.5 text-gray-300 dark:text-gray-600 hover:text-indigo-500 dark:hover:text-indigo-400 disabled:opacity-20 disabled:cursor-not-allowed transition-colors" title="Move down">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </button>
          </div>
        ) : (
          <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5 bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
            {task.status === 'running' ? (
              <svg className="w-3.5 h-3.5 text-yellow-600 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
            ) : task.status === 'done' ? (
              <svg className="w-3.5 h-3.5 text-green-600" fill="currentColor" viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" /></svg>
            ) : task.status === 'failed' ? (
              <svg className="w-3.5 h-3.5 text-red-600" fill="currentColor" viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" /></svg>
            ) : (
              <span className="text-xs text-gray-400 dark:text-gray-500">○</span>
            )}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${typeCfg.cls}`}>{typeCfg.label}</span>
            <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{plainDescription(task.description)}</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {task.task_id && <span className="text-xs text-gray-400 dark:text-gray-500 font-mono">{task.task_id}</span>}
            {parentId && (task.type === 'fix' || task.type === 'subtask') && (
              <span className="text-xs text-gray-400 dark:text-gray-500 font-mono">↳ {parentId}</span>
            )}
            {task.added_at && (
              <span className="text-xs text-gray-400 dark:text-gray-500">
                {new Date(task.added_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
            {task.finished_at && (
              <span className="text-xs text-gray-400 dark:text-gray-500">
                · {task.status === 'failed' ? 'Failed' : 'Done'} {new Date(task.finished_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </div>
          {task.error && (
            <p className="text-xs text-red-600 dark:text-red-400 mt-1 bg-red-50 dark:bg-red-950 rounded px-2 py-1">{task.error}</p>
          )}
        </div>

        {/* Status badge + actions */}
        <div className="flex items-center gap-2 shrink-0">
          <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${cfg.cls} ${task.status === 'running' ? 'animate-pulse' : ''}`}>
            <span>{cfg.icon}</span>
            {cfg.label}
          </span>
          <svg className="w-4 h-4 text-gray-300 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </div>
      </div>

      {/* Action bar */}
      {showActions && (
        <div className={`flex items-center gap-2 px-4 pb-3 pt-1 border-t ${
          task.status === 'failed' ? 'border-red-100 dark:border-red-900/40' : 'border-gray-100 dark:border-gray-800'
        }`}>
          {onRetry && (
            <button onClick={onRetry}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md bg-indigo-600 hover:bg-indigo-700 text-white transition-colors">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Retry
            </button>
          )}
          {onRemove && (
            <button onClick={onRemove}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:text-red-500 hover:border-red-300 transition-colors">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Remove
            </button>
          )}
        </div>
      )}

      {/* Cancel bar for running items */}
      {showCancel && (
        <div className="flex items-center gap-2 px-4 pb-3 pt-1 border-t border-yellow-100 dark:border-yellow-900/40">
          <button onClick={e => { e.stopPropagation(); onCancel?.() }}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950 transition-colors">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            Cancel
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Running terminal (subscribes to WS for live output) ────────────────────

function RunningTerminal({ trackPath }) {
  const [lines, setLines] = useState([])
  const [connected, setConnected] = useState(false)
  const bottomRef = useRef(null)
  const wsRef = useRef(null)

  useEffect(() => {
    if (!trackPath) return
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const ws = new WebSocket(`${protocol}://${window.location.host}/ws`)
    wsRef.current = ws

    ws.onopen = () => {
      ws.send(JSON.stringify({ action: 'subscribe', taskPath: trackPath }))
      setConnected(true)
    }

    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data)
      if (msg.type === 'stdout' || msg.type === 'stderr') {
        const clean = (msg.data || '').replace(/\x1b\[[0-9;]*[A-Za-z]/g, '')
        if (clean) setLines(prev => [...prev.slice(-200), { text: clean, isErr: msg.type === 'stderr' }])
      } else if (msg.type === 'done') {
        setLines(prev => [...prev, { text: `\nProcess exited with code ${msg.code}`, isErr: msg.code !== 0 }])
      } else if (msg.type === 'not-found') {
        setLines([{ text: 'No output available yet', isErr: false }])
      }
    }

    ws.onerror = () => setConnected(false)
    ws.onclose = () => { wsRef.current = null; setConnected(false) }

    return () => ws.close()
  }, [trackPath])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [lines])

  return (
    <div className="mt-1.5 border border-yellow-200 dark:border-yellow-900 rounded-lg overflow-hidden bg-gray-950">
      <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-900 border-b border-gray-800">
        <div className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-green-400' : 'bg-gray-500'}`} />
        <span className="text-xs font-mono text-gray-500">Live output</span>
      </div>
      <div className="overflow-y-auto p-3 max-h-64 font-mono text-xs">
        {lines.length === 0 ? (
          <span className="text-gray-600">Waiting for output...</span>
        ) : lines.map((line, i) => (
          <pre key={i} className={`whitespace-pre-wrap break-words leading-relaxed ${line.isErr ? 'text-red-400' : 'text-green-300'}`}>{line.text}</pre>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
