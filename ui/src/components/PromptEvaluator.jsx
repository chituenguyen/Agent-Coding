import { useState, useEffect } from 'react'
import { api } from '../api'

// ─── heuristic engine (instant, no API) ─────────────────────────────────────

const ACTION_VERBS = [
  'add', 'fix', 'update', 'create', 'build', 'implement', 'refactor', 'migrate',
  'remove', 'delete', 'write', 'change', 'improve', 'optimize', 'debug', 'setup',
  'configure', 'integrate', 'deploy', 'replace', 'extract', 'move', 'rename',
  'connect', 'fetch', 'send', 'validate', 'handle', 'support', 'enable', 'disable',
]

const TECHNICAL_WORDS = [
  'page', 'component', 'api', 'endpoint', 'service', 'modal', 'form', 'button',
  'route', 'database', 'table', 'field', 'column', 'function', 'method', 'class',
  'module', 'hook', 'store', 'query', 'mutation', 'event', 'handler', 'middleware',
  'controller', 'model', 'schema', 'type', 'interface', 'test', 'migration',
  'config', 'env', 'variable', 'param', 'header', 'request', 'response',
  'error', 'exception', 'log', 'cache', 'queue', 'job', 'cron', 'webhook',
  'auth', 'login', 'signup', 'user', 'role', 'permission', 'token', 'session',
  'email', 'password', 'search', 'filter', 'sort', 'pagination', 'list', 'detail',
  'layout', 'sidebar', 'navbar', 'menu', 'tab', 'dropdown', 'tooltip', 'alert',
]

function evaluate(text) {
  const trimmed = text.trim()
  const words = trimmed.split(/\s+/).filter(Boolean)
  const lower = trimmed.toLowerCase()
  const issues = []

  if (words.length < 3) return null

  if (words.length < 5) {
    issues.push('Too short — describe what needs to be done and where')
    return { level: 'weak', issues }
  }

  const hasVerb = ACTION_VERBS.some(v => lower.includes(v))
  if (!hasVerb) issues.push('Missing action — start with: fix, add, build, refactor…')

  const hasTechContext =
    words.length > 8 ||
    TECHNICAL_WORDS.some(w => lower.includes(w)) ||
    /[A-Z][a-z]+[A-Z]/.test(trimmed) ||
    /\.(jsx?|tsx?|go|py|ts|vue|css|json)/.test(lower) ||
    /\//.test(trimmed)
  if (!hasTechContext) issues.push('Add context — which page, component, API, or feature?')

  if (/\b(it|this|that|they|them)\b/i.test(trimmed) && words.length < 10)
    issues.push('Vague reference — replace "it / this / that" with the specific thing')

  if (/^(fix|update|add|change|remove|delete|refactor|improve)\s+\w+\.?$/i.test(trimmed))
    issues.push('Too generic — describe the specific behavior or problem')

  const level = issues.length === 0 ? 'good' : issues.length === 1 ? 'okay' : 'weak'
  return { level, issues }
}

// ─── component ───────────────────────────────────────────────────────────────

const LEVELS = {
  weak: { label: 'Weak prompt', color: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800', dot: 'bg-red-500' },
  okay: { label: 'Could be clearer', color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-800', dot: 'bg-amber-500' },
  good: { label: 'Good prompt', color: 'text-green-600 dark:text-green-400', bg: 'bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800', dot: 'bg-green-500' },
}

export default function PromptEvaluator({ value, mode = 'task', onRewrite }) {
  const [result, setResult] = useState(null)
  // ai states: idle | loading | questions | rewritten | error
  const [ai, setAi] = useState({ state: 'idle', data: null })
  const [answers, setAnswers] = useState({})

  // Debounced heuristic
  useEffect(() => {
    const t = setTimeout(() => setResult(evaluate(value)), 300)
    return () => clearTimeout(t)
  }, [value])

  // Reset AI state when user edits the prompt
  useEffect(() => {
    setAi({ state: 'idle', data: null })
    setAnswers({})
  }, [value])

  async function handleImprove() {
    setAi({ state: 'loading', data: null })
    try {
      const res = await api.improvePrompt(value, mode)
      if (res.action === 'rewrite') {
        setAi({ state: 'rewritten', data: res })
      } else {
        setAi({ state: 'questions', data: res })
        setAnswers({})
      }
    } catch (e) {
      setAi({ state: 'error', data: { error: e.message } })
    }
  }

  async function handleAnswersSubmit() {
    const combined = value.trim() + '\n\nAdditional context:\n' +
      ai.data.result.map((q, i) => `- ${q}\n  → ${answers[i] || '(no answer)'}`).join('\n')
    setAi({ state: 'loading', data: null })
    try {
      const res = await api.improvePrompt(combined, mode)
      setAi({ state: 'rewritten', data: res })
    } catch (e) {
      setAi({ state: 'error', data: { error: e.message } })
    }
  }

  function handleAccept() {
    onRewrite?.(ai.data.result)
    setAi({ state: 'idle', data: null })
  }

  if (!result && ai.state === 'idle') return null

  const lvl = result ? LEVELS[result.level] : null

  return (
    <div className="space-y-2">
      {/* Heuristic badge + improve button */}
      {result && (
        <div className={`rounded-lg border px-3 py-2.5 ${lvl.bg}`}>
          <div className="flex items-center justify-between gap-2">
            <div className={`flex items-center gap-1.5 text-xs font-semibold ${lvl.color}`}>
              <span className={`w-2 h-2 rounded-full shrink-0 ${lvl.dot}`} />
              {lvl.label}
            </div>
            {result.level !== 'good' && ai.state === 'idle' && (
              <button
                onClick={handleImprove}
                className="flex items-center gap-1 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
                Improve with AI
              </button>
            )}
          </div>
          {result.issues.length > 0 && (
            <ul className="mt-1.5 space-y-0.5">
              {result.issues.map((issue, i) => (
                <li key={i} className={`text-xs ${lvl.color}`}>· {issue}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* AI loading */}
      {ai.state === 'loading' && (
        <div className="flex items-center gap-2 px-3 py-2.5 bg-indigo-50 dark:bg-indigo-950 border border-indigo-200 dark:border-indigo-800 rounded-lg">
          <svg className="w-3.5 h-3.5 text-indigo-500 animate-spin shrink-0" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
          </svg>
          <span className="text-xs text-indigo-600 dark:text-indigo-400">Claude is analyzing your prompt…</span>
        </div>
      )}

      {/* AI questions */}
      {ai.state === 'questions' && (
        <div className="border border-indigo-200 dark:border-indigo-800 rounded-lg overflow-hidden">
          <div className="px-3 py-2 bg-indigo-50 dark:bg-indigo-950 border-b border-indigo-100 dark:border-indigo-900">
            <p className="text-xs font-semibold text-indigo-700 dark:text-indigo-300">
              Claude needs a bit more info
            </p>
            {ai.data.explanation && (
              <p className="text-xs text-indigo-500 dark:text-indigo-400 mt-0.5">{ai.data.explanation}</p>
            )}
          </div>
          <div className="px-3 py-3 space-y-3 bg-white dark:bg-gray-900">
            {ai.data.result.map((q, i) => (
              <div key={i}>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-200 mb-1">{q}</label>
                <input
                  type="text"
                  value={answers[i] || ''}
                  onChange={e => setAnswers(a => ({ ...a, [i]: e.target.value }))}
                  placeholder="Your answer…"
                  className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg px-2.5 py-1.5 text-xs focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                />
              </div>
            ))}
            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={handleAnswersSubmit}
                disabled={Object.keys(answers).length === 0}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-50"
              >
                Rewrite prompt →
              </button>
              <button onClick={() => setAi({ state: 'idle', data: null })}
                className="text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI rewrite result */}
      {ai.state === 'rewritten' && (
        <div className="border border-green-200 dark:border-green-800 rounded-lg overflow-hidden">
          <div className="px-3 py-2 bg-green-50 dark:bg-green-950 border-b border-green-100 dark:border-green-900 flex items-center justify-between">
            <p className="text-xs font-semibold text-green-700 dark:text-green-300">
              Suggested rewrite
            </p>
            {ai.data.explanation && (
              <span className="text-xs text-green-600 dark:text-green-400">{ai.data.explanation}</span>
            )}
          </div>
          <div className="px-3 py-3 bg-white dark:bg-gray-900">
            <p className="text-sm text-gray-700 dark:text-gray-200 leading-relaxed">{ai.data.result}</p>
            <div className="flex items-center gap-2 mt-3">
              <button
                onClick={handleAccept}
                className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-medium rounded-lg transition-colors"
              >
                Use this →
              </button>
              <button onClick={() => setAi({ state: 'idle', data: null })}
                className="text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300">
                Keep mine
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI error */}
      {ai.state === 'error' && (
        <div className="px-3 py-2 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg flex items-center justify-between">
          <span className="text-xs text-red-600 dark:text-red-400">{ai.data.error}</span>
          <button onClick={() => setAi({ state: 'idle', data: null })}
            className="text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600">Dismiss</button>
        </div>
      )}
    </div>
  )
}
