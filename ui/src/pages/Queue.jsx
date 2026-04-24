import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import Modal from '../components/Modal'
import Terminal from '../components/Terminal'

const STATUS_CONFIG = {
  pending: { label: 'Pending',  cls: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300',    icon: '○' },
  running: { label: 'Running',  cls: 'bg-yellow-100 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-300', icon: '▶' },
  done:    { label: 'Done',     cls: 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300',   icon: '✓' },
  failed:  { label: 'Failed',   cls: 'bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300',       icon: '✗' },
}

const EMPTY_FORM = { description: '', target: '' }

export default function Queue() {
  const [queue, setQueue] = useState({ tasks: [] })
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  // 'idle' | 'confirm-start' | 'running'
  const [startState, setStartState] = useState('idle')
  const [showClearMenu, setShowClearMenu] = useState(false)
  const pollRef = useRef(null)
  const navigate = useNavigate()

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

  // Poll while queue is running
  useEffect(() => {
    const hasRunning = queue.tasks.some(t => t.status === 'running')
    if (hasRunning && !pollRef.current) {
      pollRef.current = setInterval(load, 2000)
    } else if (!hasRunning && pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
    return () => {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
    }
  }, [queue.tasks])

  async function handleAdd() {
    if (!form.description.trim()) return
    setSaving(true)
    try {
      await api.addToQueue({ description: form.description.trim(), target: form.target.trim() || null })
      setShowAdd(false)
      setForm(EMPTY_FORM)
      load()
    } finally {
      setSaving(false)
    }
  }

  async function handleClear(filter) {
    setShowClearMenu(false)
    await api.clearQueue(filter)
    load()
  }

  function handleQueueDone() {
    setStartState('idle')
    load()
  }

  const tasks = queue.tasks || []
  const counts = {
    pending: tasks.filter(t => t.status === 'pending').length,
    running: tasks.filter(t => t.status === 'running').length,
    done:    tasks.filter(t => t.status === 'done').length,
    failed:  tasks.filter(t => t.status === 'failed').length,
  }
  const hasPending = counts.pending > 0
  const hasRunning = counts.running > 0

  return (
    <div className="p-8 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Queue</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            {loading ? '...' : `${tasks.length} tasks · ${counts.pending} pending · ${counts.done} done${counts.failed ? ` · ${counts.failed} failed` : ''}`}
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

          {/* Start button */}
          {(hasPending || hasRunning) && startState === 'idle' && (
            <button
              onClick={() => setStartState('confirm-start')}
              disabled={hasRunning}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
              {hasRunning ? 'Already running' : 'Start Queue'}
            </button>
          )}

          {/* Add task */}
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Task
          </button>
        </div>
      </div>

      {/* Running terminal */}
      {startState === 'running' && (
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
            <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">Queue is running</span>
            <span className="text-xs text-gray-400 dark:text-gray-500">Tasks will update automatically below</span>
          </div>
          <Terminal
            command="/queue start"
            autoStart
            onDone={handleQueueDone}
          />
        </div>
      )}

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
          <p className="text-sm mt-1">Add tasks and start the queue to process them sequentially</p>
          <button
            onClick={() => setShowAdd(true)}
            className="mt-4 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Add first task
          </button>
        </div>
      ) : (
        <div className="space-y-1.5">
          {tasks.map((task, i) => (
            <QueueRow
              key={i}
              index={i}
              task={task}
              onNavigate={() => task.project && task.task_id && navigate(`/tasks/${task.project}/${task.task_id}`)}
            />
          ))}
        </div>
      )}

      {/* Add task modal */}
      {showAdd && (
        <Modal
          title="Add to Queue"
          onClose={() => { setShowAdd(false); setForm(EMPTY_FORM) }}
          footer={
            <>
              <button
                onClick={() => { setShowAdd(false); setForm(EMPTY_FORM) }}
                className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAdd}
                disabled={saving || !form.description.trim()}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
              >
                {saving ? 'Adding...' : 'Add to Queue'}
              </button>
            </>
          }
        >
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1.5">
                Task Description <span className="text-red-400">*</span>
              </label>
              <textarea
                rows={3}
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleAdd() }}
                placeholder="e.g. Build a login API with JWT authentication"
                className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none resize-none"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1.5">
                Target Repository <span className="text-gray-400 dark:text-gray-500 font-normal">(optional)</span>
              </label>
              <input
                type="text"
                value={form.target}
                onChange={e => setForm(f => ({ ...f, target: e.target.value }))}
                placeholder="/path/to/your/repo"
                className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none font-mono"
              />
            </div>
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2 border border-gray-200 dark:border-gray-700">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Will run: <code className="text-indigo-600 font-mono">
                  /queue add "{form.description.trim() || '...'}"
                  {form.target.trim() ? ` --target ${form.target.trim()}` : ''}
                </code>
              </p>
            </div>
          </div>
        </Modal>
      )}

      {/* Confirm start modal */}
      {startState === 'confirm-start' && (
        <Modal
          title="Start Queue"
          onClose={() => setStartState('idle')}
          footer={
            <>
              <button onClick={() => setStartState('idle')} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">
                Cancel
              </button>
              <button
                onClick={() => setStartState('running')}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition-colors"
              >
                Start Processing
              </button>
            </>
          }
        >
          <div className="space-y-3">
            <p className="text-sm text-gray-600 dark:text-gray-300">
              This will run <code className="text-indigo-600 font-mono text-xs bg-indigo-50 dark:bg-indigo-950 px-1.5 py-0.5 rounded">/queue start</code> — processing all <strong>{counts.pending} pending</strong> tasks sequentially. Each task will run the full multi-agent workflow.
            </p>
            <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
              <p className="text-xs text-amber-700 dark:text-amber-400">
                The queue runs until all pending tasks are done or a task fails. You can add more tasks while it runs.
              </p>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

function QueueRow({ index, task, onNavigate }) {
  const cfg = STATUS_CONFIG[task.status] ?? STATUS_CONFIG.pending
  const canNavigate = task.project && task.task_id

  return (
    <div className={`flex items-start gap-4 px-4 py-3 bg-white dark:bg-gray-900 rounded-lg border transition-all ${
      canNavigate ? 'hover:border-indigo-300 hover:shadow-sm cursor-pointer' : 'border-gray-200 dark:border-gray-700'
    } ${task.status === 'running' ? 'border-yellow-300 bg-yellow-50/30 dark:bg-yellow-900/20' : ''}`}
      onClick={canNavigate ? onNavigate : undefined}
    >
      {/* Position / status icon */}
      <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5 bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
        {task.status === 'running' ? (
          <svg className="w-3.5 h-3.5 text-yellow-600 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
          </svg>
        ) : task.status === 'done' ? (
          <svg className="w-3.5 h-3.5 text-green-600" fill="currentColor" viewBox="0 0 24 24">
            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
          </svg>
        ) : task.status === 'failed' ? (
          <svg className="w-3.5 h-3.5 text-red-600" fill="currentColor" viewBox="0 0 24 24">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
          </svg>
        ) : (
          <span className="text-xs text-gray-400 dark:text-gray-500">{index + 1}</span>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{task.description}</p>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          {task.target && (
            <span className="text-xs text-gray-400 dark:text-gray-500 font-mono truncate max-w-xs">{task.target}</span>
          )}
          {task.task_id && (
            <span className="text-xs text-gray-400 dark:text-gray-500 font-mono">{task.task_id}</span>
          )}
          {task.added_at && (
            <span className="text-xs text-gray-400 dark:text-gray-500">
              Added {new Date(task.added_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          {task.finished_at && (
            <span className="text-xs text-gray-400 dark:text-gray-500">
              · Finished {new Date(task.finished_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>
        {task.error && (
          <p className="text-xs text-red-600 dark:text-red-400 mt-1 bg-red-50 dark:bg-red-950 rounded px-2 py-1">{task.error}</p>
        )}
      </div>

      {/* Status badge */}
      <div className="flex items-center gap-2 shrink-0">
        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${cfg.cls}`}>
          <span>{cfg.icon}</span>
          {cfg.label}
        </span>
        {canNavigate && (
          <svg className="w-4 h-4 text-gray-300 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        )}
      </div>
    </div>
  )
}
