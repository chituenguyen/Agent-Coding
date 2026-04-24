import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import StatusBadge from '../components/StatusBadge'
import Modal from '../components/Modal'
import Terminal from '../components/Terminal'

const EMPTY_FORM = { description: '', targetPath: '' }

export default function Tasks() {
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [activeProject, setActiveProject] = useState('all')
  // step: null | 'form' | 'running'
  const [createStep, setCreateStep] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [createCommand, setCreateCommand] = useState('')
  const navigate = useNavigate()

  async function load() {
    setLoading(true)
    setError(null)
    try {
      setTasks(await api.getTasks())
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  function handleCreate() {
    if (!form.description.trim()) return
    // Build the /create-task command exactly as the CLI expects
    const desc = form.description.trim().replace(/"/g, '\\"')
    const target = form.targetPath.trim()
    const cmd = target
      ? `/create-task "${desc}" --target ${target}`
      : `/create-task "${desc}"`
    setCreateCommand(cmd)
    setCreateStep('running')
  }

  function handleCreateDone() {
    // Claude finished running /create-task — reload tasks and close modal
    setCreateStep(null)
    setForm(EMPTY_FORM)
    load()
  }

  async function handleDelete(task, e) {
    e.stopPropagation()
    if (!confirm(`Delete task "${task.description}"?`)) return
    try {
      await api.deleteTask(task.project, task.taskId)
      load()
    } catch (err) {
      alert('Failed to delete: ' + err.message)
    }
  }

  async function handleClearDone() {
    const done = tasks.filter(t => t.status === 'done')
    if (!done.length) return
    if (!confirm(`Delete ${done.length} completed task${done.length !== 1 ? 's' : ''}?`)) return
    await Promise.all(done.map(t => api.deleteTask(t.project, t.taskId)))
    load()
  }

  const projects = [...new Set(tasks.map(t => t.project))].sort()
  const filtered = activeProject === 'all' ? tasks : tasks.filter(t => t.project === activeProject)
  const grouped = filtered.reduce((acc, t) => {
    if (!acc[t.project]) acc[t.project] = []
    acc[t.project].push(t)
    return acc
  }, {})

  return (
    <div className="p-8 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Tasks</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            {loading ? '...' : `${tasks.length} task${tasks.length !== 1 ? 's' : ''} across ${projects.length} project${projects.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {tasks.some(t => t.status === 'done') && (
            <button
              onClick={handleClearDone}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700 hover:border-red-300 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950 rounded-lg transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Clear done
            </button>
          )}
          <button
            onClick={() => setCreateStep('form')}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Task
          </button>
        </div>
      </div>

      {/* Project filter tabs */}
      {!loading && projects.length > 1 && (
        <div className="flex items-center gap-1.5 mb-5 flex-wrap">
          <button
            onClick={() => setActiveProject('all')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              activeProject === 'all'
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            All
            <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full ${activeProject === 'all' ? 'bg-indigo-500 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400'}`}>
              {tasks.length}
            </span>
          </button>
          {projects.map(p => (
            <button
              key={p}
              onClick={() => setActiveProject(p)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                activeProject === p
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
            >
              {p}
              <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full ${activeProject === p ? 'bg-indigo-500 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400'}`}>
                {tasks.filter(t => t.project === p).length}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="flex items-center gap-2 text-gray-400 dark:text-gray-500 text-sm py-8">
          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
          </svg>
          Loading tasks...
        </div>
      ) : error ? (
        <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg p-4 text-red-700 dark:text-red-400 text-sm">{error}</div>
      ) : tasks.length === 0 ? (
        <div className="text-center py-20 text-gray-400 dark:text-gray-500">
          <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-gray-300 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
          <p className="font-medium text-gray-600 dark:text-gray-300">No tasks yet</p>
          <p className="text-sm mt-1">Create a task and run the multi-agent workflow</p>
          <button
            onClick={() => setCreateStep('form')}
            className="mt-4 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Create your first task
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-400 dark:text-gray-500 text-sm">No tasks in this project</div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([project, projectTasks]) => (
            <div key={project}>
              {activeProject === 'all' && (
                <div className="flex items-center gap-2 mb-2">
                  <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    {project}
                  </h2>
                  <span className="text-xs text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded-full">
                    {projectTasks.length}
                  </span>
                </div>
              )}
              <div className="space-y-1.5">
                {projectTasks.map((task) => (
                  <TaskRow key={task.taskId} task={task} onClick={() => navigate(`/tasks/${task.project}/${task.taskId}`)} onDelete={(e) => handleDelete(task, e)} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Step 1: Form */}
      {createStep === 'form' && (
        <Modal
          title="New Task"
          onClose={() => { setCreateStep(null); setForm(EMPTY_FORM) }}
          footer={
            <>
              <button
                onClick={() => { setCreateStep(null); setForm(EMPTY_FORM) }}
                className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={!form.description.trim()}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Create Task →
              </button>
            </>
          }
        >
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1.5">
                What do you want to build or fix? <span className="text-red-400">*</span>
              </label>
              <textarea
                rows={4}
                value={form.description}
                onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))}
                onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleCreate() }}
                placeholder="e.g. Build a login API with JWT authentication..."
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
                value={form.targetPath}
                onChange={(e) => setForm(f => ({ ...f, targetPath: e.target.value }))}
                placeholder="/path/to/your/repo"
                className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none font-mono"
              />
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1.5">
                Absolute path to the repo. Leave empty → outputs to <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">tasks/workspace/</code>
              </p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2 border border-gray-200 dark:border-gray-700">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Will run: <code className="text-indigo-600 font-mono">
                  /create-task "{form.description.trim() || '...'}"
                  {form.targetPath.trim() ? ` --target ${form.targetPath.trim()}` : ''}
                </code>
              </p>
            </div>
          </div>
        </Modal>
      )}

      {/* Step 2: Running /create-task via Claude */}
      {createStep === 'running' && (
        <Modal
          title="Creating task..."
          onClose={handleCreateDone}
          wide
        >
          <div className="space-y-3">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Running <code className="text-indigo-600 font-mono text-xs bg-indigo-50 dark:bg-indigo-950 px-1.5 py-0.5 rounded">{createCommand}</code>
            </p>
            <Terminal
              command={createCommand}
              autoStart
              onDone={handleCreateDone}
            />
            <p className="text-xs text-gray-400 dark:text-gray-500 text-center">
              Task will appear in the list when done. You can close this at any time.
            </p>
          </div>
        </Modal>
      )}
    </div>
  )
}

function TaskRow({ task, onClick, onDelete }) {
  const date = task.created
    ? new Date(task.created).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : ''

  return (
    <div
      onClick={onClick}
      className="flex items-center gap-4 px-4 py-3 bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-indigo-300 hover:shadow-sm cursor-pointer transition-all group"
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 dark:text-white truncate group-hover:text-indigo-700 transition-colors">
          {task.description}
        </p>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 font-mono truncate">{task.taskId}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <StatusBadge status={task.status} />
        {date && <span className="text-xs text-gray-400 dark:text-gray-500">{date}</span>}
        <button
          onClick={onDelete}
          title="Delete task"
          className="opacity-0 group-hover:opacity-100 p-1.5 rounded-md text-gray-300 dark:text-gray-600 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950 transition-all"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
        <svg className="w-4 h-4 text-gray-300 dark:text-gray-600 group-hover:text-indigo-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </div>
  )
}
