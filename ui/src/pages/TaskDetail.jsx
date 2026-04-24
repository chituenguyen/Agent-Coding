import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../api'
import StatusBadge from '../components/StatusBadge'
import Terminal from '../components/Terminal'

function useAddToQueue() {
  const [state, setState] = useState('idle') // idle | loading | done | error
  async function addToQueue(task) {
    setState('loading')
    try {
      await api.addToQueue({
        description: task.description,
        target: task.targetPath && task.targetPath !== 'N/A' ? task.targetPath : undefined,
        task_id: task.taskId,
        project: task.project,
      })
      setState('done')
      setTimeout(() => setState('idle'), 2000)
    } catch {
      setState('error')
      setTimeout(() => setState('idle'), 2000)
    }
  }
  return { state, addToQueue }
}

const STEPS = [
  { key: 'created', label: 'Created' },
  { key: 'planned', label: 'Spec Written' },
  { key: 'coded', label: 'Code Written' },
  { key: 'reviewed', label: 'Reviewed' },
  { key: 'done', label: 'Committed' },
]

const STATUS_TO_STEP = {
  created: 0,
  planned: 1,
  coded: 2,
  issues: 2,
  fixed: 2,
  approved: 3,
  done: 4,
}

export default function TaskDetail() {
  const { project, taskId } = useParams()
  const [task, setTask] = useState(null)
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  async function load() {
    setLoading(true)
    try {
      setTask(await api.getTask(project, taskId))
    } catch {
      navigate('/tasks')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [project, taskId])

  const { state: queueState, addToQueue } = useAddToQueue()

  if (loading) {
    return (
      <div className="p-8 flex items-center gap-2 text-gray-400 dark:text-gray-500 text-sm">
        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
        </svg>
        Loading task...
      </div>
    )
  }

  if (!task) return null

  const stepIndex = STATUS_TO_STEP[task.status] ?? 0
  const hasIssues = task.status === 'issues'

  return (
    <div className="p-8 max-w-4xl">
      {/* Back */}
      <button
        onClick={() => navigate('/tasks')}
        className="flex items-center gap-1.5 text-sm text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 mb-6 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        All Tasks
      </button>

      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white leading-snug">{task.description}</h1>
          <div className="flex items-center gap-3 mt-1.5">
            <span className="text-xs text-gray-400 dark:text-gray-500 font-mono">{task.taskId}</span>
            <span className="text-gray-300 dark:text-gray-600">·</span>
            <span className="text-xs text-gray-400 dark:text-gray-500">{task.project}</span>
            {task.targetPath && task.targetPath !== 'N/A' && (
              <>
                <span className="text-gray-300 dark:text-gray-600">·</span>
                <span className="text-xs text-gray-400 dark:text-gray-500 font-mono truncate max-w-xs">{task.targetPath}</span>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <StatusBadge status={task.status} />
          <AddToQueueBtn state={queueState} onClick={() => addToQueue(task)} />
        </div>
      </div>

      {/* Progress steps */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-5 mb-6">
        <div className="flex items-center">
          {STEPS.map((step, i) => (
            <div key={step.key} className="flex items-center flex-1 last:flex-none">
              <div className="flex flex-col items-center">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all ${
                  i < stepIndex
                    ? 'bg-indigo-600 border-indigo-600 text-white'
                    : i === stepIndex
                    ? hasIssues
                      ? 'bg-red-500 border-red-500 text-white'
                      : 'bg-indigo-600 border-indigo-600 text-white ring-4 ring-indigo-100'
                    : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-300 dark:text-gray-600'
                }`}>
                  {i < stepIndex ? (
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                    </svg>
                  ) : (
                    <span>{i + 1}</span>
                  )}
                </div>
                <span className={`text-xs mt-1.5 whitespace-nowrap font-medium ${
                  i <= stepIndex ? 'text-gray-700 dark:text-gray-200' : 'text-gray-300 dark:text-gray-600'
                }`}>
                  {step.label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={`flex-1 h-0.5 mx-2 mb-5 transition-all ${
                  i < stepIndex ? 'bg-indigo-600' : 'bg-gray-200 dark:bg-gray-700'
                }`} />
              )}
            </div>
          ))}
        </div>

        {hasIssues && (
          <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800 flex items-start gap-2">
            <svg className="w-4 h-4 text-red-500 mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
            </svg>
            <p className="text-sm text-red-600 dark:text-red-400">Reviewer found issues. Run the workflow again or check the Issues file below.</p>
          </div>
        )}
      </div>

      {/* Workflow terminal */}
      <div className="mb-6">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3 flex items-center gap-2">
          <svg className="w-4 h-4 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          Workflow Runner
        </h2>
        <Terminal
          taskPath={`tasks/${project}/${taskId}`}
          onDone={load}
        />
      </div>

      {/* Output files */}
      {(task.files.spec || task.files.approval || task.files.issues || task.files.commit ||
        task.files.backendSummary || task.files.frontendSummary || task.files.fixLog) && (
        <div>
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3 flex items-center gap-2">
            <svg className="w-4 h-4 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Output Files
          </h2>
          <div className="space-y-2">
            {task.files.spec && (
              <FileCard title="SPEC.md" content={task.files.spec} variant="default" defaultOpen={false} />
            )}
            {task.files.backendSummary && (
              <FileCard title="Backend Summary" content={task.files.backendSummary} variant="default" />
            )}
            {task.files.frontendSummary && (
              <FileCard title="Frontend Summary" content={task.files.frontendSummary} variant="default" />
            )}
            {task.files.issues && (
              <FileCard title="Issues Found" content={task.files.issues} variant="red" defaultOpen={true} />
            )}
            {task.files.fixLog && (
              <FileCard title="Fix Log" content={task.files.fixLog} variant="orange" />
            )}
            {task.files.approval && (
              <FileCard title="Approval" content={task.files.approval} variant="green" defaultOpen={true} />
            )}
            {task.files.commit && (
              <FileCard title="Commit Info" content={task.files.commit} variant="indigo" defaultOpen={true} />
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function AddToQueueBtn({ state, onClick }) {
  const config = {
    idle:    { label: 'Add to Queue', cls: 'text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-indigo-300 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950', icon: (
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
      </svg>
    )},
    loading: { label: 'Adding...', cls: 'text-gray-400 dark:text-gray-500 border-gray-200 dark:border-gray-700 cursor-not-allowed', icon: (
      <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
      </svg>
    )},
    done:    { label: 'Added!', cls: 'text-green-600 border-green-200 bg-green-50 dark:bg-green-950', icon: (
      <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
        <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
      </svg>
    )},
    error:   { label: 'Failed', cls: 'text-red-500 border-red-200 bg-red-50 dark:bg-red-950', icon: (
      <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
        <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
      </svg>
    )},
  }
  const { label, cls, icon } = config[state] ?? config.idle
  return (
    <button
      onClick={onClick}
      disabled={state !== 'idle'}
      className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border rounded-lg transition-colors ${cls}`}
    >
      {icon}
      {label}
    </button>
  )
}

function FileCard({ title, content, variant = 'default', defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen)

  const variants = {
    default: { header: 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700', body: 'bg-white dark:bg-gray-900', text: 'text-gray-700 dark:text-gray-200' },
    green:   { header: 'bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800 hover:bg-green-100 dark:hover:bg-green-900', body: 'bg-green-50 dark:bg-green-950', text: 'text-green-800 dark:text-green-300' },
    red:     { header: 'bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800 hover:bg-red-100 dark:hover:bg-red-900', body: 'bg-red-50 dark:bg-red-950', text: 'text-red-800 dark:text-red-300' },
    orange:  { header: 'bg-orange-50 dark:bg-orange-950 border-orange-200 dark:border-orange-800 hover:bg-orange-100 dark:hover:bg-orange-900', body: 'bg-orange-50 dark:bg-orange-950', text: 'text-orange-800 dark:text-orange-300' },
    indigo:  { header: 'bg-indigo-50 dark:bg-indigo-950 border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 dark:hover:bg-indigo-900', body: 'bg-indigo-50 dark:bg-indigo-950', text: 'text-indigo-800 dark:text-indigo-300' },
  }

  const v = variants[variant]

  return (
    <div className={`border rounded-xl overflow-hidden ${v.header.split(' ')[1]}`}>
      <button
        onClick={() => setOpen(o => !o)}
        className={`w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-left transition-colors ${v.header}`}
      >
        <span className={v.text}>{title}</span>
        <svg
          className={`w-4 h-4 text-gray-400 dark:text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className={`px-4 pb-4 pt-3 ${v.body}`}>
          <pre className="text-xs text-gray-700 dark:text-gray-200 whitespace-pre-wrap break-words font-mono bg-white/70 dark:bg-gray-800/70 rounded-lg p-3 border border-gray-100 dark:border-gray-800 max-h-96 overflow-y-auto">
            {content}
          </pre>
        </div>
      )}
    </div>
  )
}
