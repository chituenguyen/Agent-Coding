import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import TaskFormFields from '../components/TaskFormFields'

const EMPTY_FORM = {
  description: '',
  target: '',
  fix: false,
  run: false,
  runCmd: '',
}

export default function Investigate() {
  const [form, setForm] = useState(EMPTY_FORM)
  const [queueState, setQueueState] = useState('idle') // idle | loading | done | error
  const navigate = useNavigate()

  async function handleAddToQueue() {
    if (!form.description.trim()) return
    setQueueState('loading')
    try {
      const desc = form.description.trim()
      let fullDesc = desc
      if (form.fix) fullDesc += ' [--fix]'
      if (form.run) fullDesc += form.runCmd.trim() ? ` [--run "${form.runCmd.trim()}"]` : ' [--run]'
      await api.addToQueue({
        description: fullDesc,
        target: form.target.trim() || undefined,
        type: 'investigate',
      })
      setQueueState('done')
      setTimeout(() => {
        setQueueState('idle')
        setForm(EMPTY_FORM)
        navigate('/queue')
      }, 1000)
    } catch {
      setQueueState('error')
      setTimeout(() => setQueueState('idle'), 2000)
    }
  }

  return (
    <div className="p-8 max-w-3xl">
      {/* Header */}
      <div className="mb-8 flex items-start gap-4">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg shadow-amber-200/50 dark:shadow-amber-900/30 shrink-0">
          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Investigate</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Describe a bug — the Investigator agent traces it to the root cause
          </p>
        </div>
      </div>

      {/* Form card */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-sm overflow-hidden">
        {/* Bug description */}
        <div className="p-6 pb-4">
          <TaskFormFields
            description={form.description}
            onDescriptionChange={txt => setForm(f => ({ ...f, description: txt }))}
            targetRepo={form.target}
            onTargetChange={v => setForm(f => ({ ...f, target: v }))}
            mode="investigate"
            descriptionLabel="Bug Description"
            placeholder={"e.g. Login button does nothing on mobile Safari\ne.g. Payment webhook fails with 500 on retry\ne.g. useEffect runs infinitely when user object updates"}
            onSubmit={handleAddToQueue}
          />
        </div>

        {/* Options */}
        <div className="px-6 py-4 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-100 dark:border-gray-800">
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Options</p>
          <div className="flex items-start gap-6">
            {/* --fix */}
            <label className="flex items-start gap-2.5 cursor-pointer group">
              <input
                type="checkbox"
                checked={form.fix}
                onChange={e => setForm(f => ({ ...f, fix: e.target.checked }))}
                className="mt-0.5 w-4 h-4 text-amber-500 rounded border-gray-300 dark:border-gray-600 focus:ring-amber-500"
              />
              <div>
                <span className="text-sm font-medium text-gray-700 dark:text-gray-200 group-hover:text-gray-900 dark:group-hover:text-white">
                  Auto-fix <code className="text-xs bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 rounded ml-0.5">--fix</code>
                </span>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">After finding root cause, also apply the fix</p>
              </div>
            </label>

            {/* --run */}
            <div className="flex-1">
              <label className="flex items-start gap-2.5 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={form.run}
                  onChange={e => setForm(f => ({ ...f, run: e.target.checked }))}
                  className="mt-0.5 w-4 h-4 text-amber-500 rounded border-gray-300 dark:border-gray-600 focus:ring-amber-500"
                />
                <div className="flex-1">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-200 group-hover:text-gray-900 dark:group-hover:text-white">
                    Run to verify <code className="text-xs bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 rounded ml-0.5">--run</code>
                  </span>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Execute tests/app to confirm root cause</p>
                </div>
              </label>
              {form.run && (
                <input
                  type="text"
                  value={form.runCmd}
                  onChange={e => setForm(f => ({ ...f, runCmd: e.target.value }))}
                  placeholder="npm test  (leave empty to auto-detect)"
                  className="mt-2 ml-6 w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 dark:text-gray-100 rounded-lg px-3 py-1.5 text-xs focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none font-mono"
                />
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-800 flex items-center gap-3">
          {/* Command preview */}
          <div className="flex-1 flex items-center gap-2 bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2 border border-gray-100 dark:border-gray-700">
            <svg className="w-3.5 h-3.5 text-amber-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate font-mono">
              /investigate
              {form.target.trim() && <span className="text-gray-400 dark:text-gray-500"> --target {form.target.trim().split('/').pop()}</span>}
              {form.fix && <span className="text-amber-500 dark:text-amber-400 ml-1">--fix</span>}
              {form.run && <span className="text-amber-500 dark:text-amber-400 ml-1">--run</span>}
            </p>
          </div>
          <QueueBtn state={queueState} onClick={handleAddToQueue} disabled={!form.description.trim()} />
        </div>
      </div>

      {/* How it works */}
      <div className="mt-6 grid grid-cols-3 gap-3">
        {[
          { icon: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z', title: 'Trace', desc: 'Searches codebase for the root cause' },
          { icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2', title: 'Report', desc: 'Returns file:line causal chain' },
          { icon: 'M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15', title: 'Fix', desc: 'Optionally applies the fix automatically' },
        ].map(step => (
          <div key={step.title} className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-xl p-4 text-center">
            <div className="w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center mx-auto mb-2">
              <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={step.icon} />
              </svg>
            </div>
            <p className="text-xs font-semibold text-gray-700 dark:text-gray-200">{step.title}</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{step.desc}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

function QueueBtn({ state, onClick, disabled }) {
  const config = {
    idle:    { label: 'Add to Queue', cls: 'bg-amber-500 hover:bg-amber-600 text-white shadow-sm shadow-amber-200/50 dark:shadow-amber-900/30' },
    loading: { label: 'Adding...', cls: 'bg-gray-400 text-white cursor-not-allowed' },
    done:    { label: 'Queued', cls: 'bg-green-600 text-white' },
    error:   { label: 'Failed', cls: 'bg-red-500 text-white' },
  }
  const { label, cls } = config[state] ?? config.idle
  return (
    <button
      onClick={onClick}
      disabled={disabled || state !== 'idle'}
      className={`flex items-center gap-2 px-5 py-2.5 text-sm font-medium rounded-xl transition-all shrink-0 disabled:opacity-50 disabled:cursor-not-allowed ${cls}`}
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h8m-8 4h4" />
      </svg>
      {label}
    </button>
  )
}
