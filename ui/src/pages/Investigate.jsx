import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import Terminal from '../components/Terminal'
import { api } from '../api'
import PromptEvaluator from '../components/PromptEvaluator'

const EMPTY_FORM = {
  description: '',
  target: '',
  fix: false,
  run: false,
  runCmd: '',
}

export default function Investigate() {
  const [form, setForm] = useState(EMPTY_FORM)
  const [command, setCommand] = useState(null)
  const [history, setHistory] = useState([]) // past investigations
  const terminalKey = useRef(0) // force remount Terminal on new run
  const [queueState, setQueueState] = useState('idle') // idle | loading | done | error
  const navigate = useNavigate()

  async function addToQueue() {
    if (!form.description.trim()) return
    setQueueState('loading')
    try {
      await api.addToQueue({
        description: form.description.trim(),
        target: form.target.trim() || undefined,
      })
      setQueueState('done')
      setTimeout(() => setQueueState('idle'), 2000)
    } catch {
      setQueueState('error')
      setTimeout(() => setQueueState('idle'), 2000)
    }
  }

  function buildCommand(f) {
    const desc = f.description.trim().replace(/"/g, '\\"')
    let cmd = `/investigate "${desc}"`
    if (f.target.trim()) cmd += ` --target ${f.target.trim()}`
    if (f.fix) cmd += ' --fix'
    if (f.run) cmd += f.runCmd.trim() ? ` --run "${f.runCmd.trim()}"` : ' --run'
    return cmd
  }

  function handleStart() {
    if (!form.description.trim()) return
    const cmd = buildCommand(form)
    // Save to history
    setHistory(h => [{ cmd, description: form.description.trim(), at: new Date() }, ...h.slice(0, 9)])
    terminalKey.current += 1
    setCommand(cmd)
  }

  function handleRerun(cmd) {
    terminalKey.current += 1
    setCommand(cmd)
  }

  const previewCmd = buildCommand(form)

  return (
    <div className="p-8 max-w-4xl">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Investigate</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
          Describe a bug — the Investigator agent traces it to the root cause
        </p>
      </div>

      {/* Form */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-5 mb-5">
        <div className="space-y-4">
          {/* Bug description */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-200 mb-1.5">
              Bug Description <span className="text-red-400">*</span>
            </label>
            <textarea
              rows={4}
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleStart() }}
              placeholder="e.g. Login button does nothing on mobile Safari&#10;e.g. Payment webhook fails with 500 on retry&#10;e.g. useEffect runs infinitely when user object updates"
              className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none resize-none"
            />
            <div className="mt-2">
              <PromptEvaluator value={form.description} mode="investigate" onRewrite={txt => setForm(f => ({ ...f, description: txt }))} />
            </div>
          </div>

          {/* Target repo */}
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

          {/* Options row */}
          <div className="flex items-start gap-6 pt-1">
            {/* --fix */}
            <label className="flex items-start gap-2.5 cursor-pointer group">
              <input
                type="checkbox"
                checked={form.fix}
                onChange={e => setForm(f => ({ ...f, fix: e.target.checked }))}
                className="mt-0.5 w-4 h-4 text-indigo-600 rounded"
              />
              <div>
                <span className="text-sm font-medium text-gray-700 dark:text-gray-200 group-hover:text-gray-900 dark:group-hover:text-white">
                  Auto-fix <code className="text-xs bg-gray-100 dark:bg-gray-800 text-indigo-600 px-1 rounded ml-0.5">--fix</code>
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
                  className="mt-0.5 w-4 h-4 text-indigo-600 rounded"
                />
                <div className="flex-1">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-200 group-hover:text-gray-900 dark:group-hover:text-white">
                    Run to verify <code className="text-xs bg-gray-100 dark:bg-gray-800 text-indigo-600 px-1 rounded ml-0.5">--run</code>
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
                  className="mt-2 ml-6 w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg px-3 py-1.5 text-xs focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none font-mono"
                />
              )}
            </div>
          </div>

          {/* Command preview */}
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2 border border-gray-200 dark:border-gray-700">
            <p className="text-xs text-gray-500 dark:text-gray-400 font-mono truncate">
              <span className="text-gray-400 dark:text-gray-500">$ </span>
              <span className="text-indigo-600">{previewCmd}</span>
            </p>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 pt-1 border-t border-gray-100 dark:border-gray-800">
            <p className="flex-1 text-xs text-gray-400 dark:text-gray-500">
              Run now or add to queue for later
            </p>
            {/* Add to queue */}
            <QueueBtn state={queueState} onClick={addToQueue} disabled={!form.description.trim()} />
            {/* Investigate now */}
            <button
              onClick={handleStart}
              disabled={!form.description.trim()}
              className="flex items-center gap-2 px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              Investigate
            </button>
          </div>
        </div>
      </div>

      {/* Terminal output */}
      {command && (
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <svg className="w-4 h-4 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">Root Cause Report</span>
          </div>
          <Terminal
            key={terminalKey.current}
            command={command}
            autoStart
          />
        </div>
      )}

      {/* History */}
      {history.length > 1 && (
        <div>
          <h2 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">Recent Investigations</h2>
          <div className="space-y-1">
            {history.slice(1).map((item, i) => (
              <div
                key={i}
                className="flex items-center gap-3 px-3 py-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg hover:border-indigo-300 cursor-pointer group"
                onClick={() => handleRerun(item.cmd)}
              >
                <svg className="w-3.5 h-3.5 text-gray-300 dark:text-gray-600 group-hover:text-indigo-400 shrink-0 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="flex-1 text-sm text-gray-600 dark:text-gray-300 truncate">{item.description}</span>
                <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0">
                  {item.at.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                </span>
                <svg className="w-3.5 h-3.5 text-gray-300 dark:text-gray-600 group-hover:text-indigo-400 shrink-0 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function QueueBtn({ state, onClick, disabled }) {
  const config = {
    idle:    { label: 'Add to Queue', cls: 'text-gray-600 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:border-indigo-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950' },
    loading: { label: 'Adding...', cls: 'text-gray-400 dark:text-gray-500 border-gray-200 dark:border-gray-700 cursor-not-allowed' },
    done:    { label: 'Queued ✓', cls: 'text-green-600 border-green-300 bg-green-50 dark:bg-green-950' },
    error:   { label: 'Failed', cls: 'text-red-500 border-red-200 bg-red-50 dark:bg-red-950' },
  }
  const { label, cls } = config[state] ?? config.idle
  return (
    <button
      onClick={onClick}
      disabled={disabled || state !== 'idle'}
      title="Add to queue for later processing"
      className={`flex items-center gap-2 px-5 py-2 text-sm font-medium border rounded-lg transition-colors shrink-0 disabled:opacity-50 disabled:cursor-not-allowed ${cls}`}
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h8m-8 4h4" />
      </svg>
      {label}
    </button>
  )
}
