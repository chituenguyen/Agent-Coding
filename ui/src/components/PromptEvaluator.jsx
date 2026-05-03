import { useState, useEffect } from 'react'

const API_BASE = '/api'

// Render XML-tagged content with syntax highlighting
function XmlPromptDisplay({ text }) {
  // Split into segments: XML tags and content
  const parts = []
  const tagRe = /(<\/?[\w_]+>)/g
  let last = 0
  let m
  while ((m = tagRe.exec(text)) !== null) {
    if (m.index > last) parts.push({ type: 'text', value: text.slice(last, m.index) })
    const isClose = m[1].startsWith('</')
    const tagName = m[1].replace(/[<>/]/g, '')
    parts.push({ type: 'tag', isClose, tagName, value: m[1] })
    last = m.index + m[1].length
  }
  if (last < text.length) parts.push({ type: 'text', value: text.slice(last) })

  return (
    <div className="font-mono text-xs leading-relaxed whitespace-pre-wrap break-words">
      {parts.map((p, i) =>
        p.type === 'tag' ? (
          <span key={i} className={p.isClose
            ? 'text-indigo-400 dark:text-indigo-400'
            : 'text-indigo-600 dark:text-indigo-300 font-semibold'
          }>{p.value}</span>
        ) : (
          <span key={i} className="text-gray-700 dark:text-gray-200">{p.value}</span>
        )
      )}
    </div>
  )
}

function RewrittenResult({ data, editedResult, setEditedResult, onAccept, onReEnhance, onDismiss }) {
  const [editing, setEditing] = useState(false)
  const hasXml = /<[\w_]+>/.test(editedResult)

  return (
    <div className="border border-green-200 dark:border-green-800 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2 bg-green-50 dark:bg-green-950 border-b border-green-100 dark:border-green-900 flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-green-700 dark:text-green-300">Suggested rewrite</p>
          {data.explanation && (
            <p className="text-xs text-green-600 dark:text-green-400 mt-0.5">{data.explanation}</p>
          )}
        </div>
        {hasXml && (
          <button
            type="button"
            onClick={() => setEditing(e => !e)}
            className="text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 shrink-0 mt-0.5 transition-colors"
          >
            {editing ? 'Preview' : 'Edit'}
          </button>
        )}
      </div>

      {/* Content — rendered XML or raw textarea */}
      <div className="bg-white dark:bg-gray-900 px-3 pt-3 pb-2 max-h-72 overflow-y-auto">
        {editing || !hasXml ? (
          <textarea
            rows={8}
            value={editedResult}
            onChange={e => setEditedResult(e.target.value)}
            className="w-full text-xs text-gray-700 dark:text-gray-200 leading-relaxed bg-transparent border-0 outline-none resize-y p-0 font-mono"
            autoFocus
          />
        ) : (
          <XmlPromptDisplay text={editedResult} />
        )}
      </div>

      {/* Actions */}
      <div className="px-3 py-2 bg-gray-50 dark:bg-gray-800 border-t border-green-100 dark:border-green-900 flex items-center gap-3">
        <button
          onClick={onAccept}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-medium rounded-lg transition-colors"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          Use this
        </button>
        <button
          onClick={onReEnhance}
          className="text-xs text-indigo-500 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors"
        >
          Re-enhance
        </button>
        <button onClick={onDismiss} className="text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors ml-auto">
          Discard
        </button>
      </div>
    </div>
  )
}

// state: idle | streaming | questions | rewritten | error
export default function PromptEvaluator({ value, targetRepo, mode = 'task', onRewrite }) {
  const [state, setState] = useState('idle')
  const [data, setData] = useState(null)
  const [answers, setAnswers] = useState({})
  const [editedResult, setEditedResult] = useState('')
  const [streamText, setStreamText] = useState('')

  // Reset when prompt changes
  useEffect(() => {
    setState('idle')
    setData(null)
    setAnswers({})
    setEditedResult('')
    setStreamText('')
  }, [value])

  if (!value.trim()) return null

  const hasRepo = targetRepo?.trim()

  async function runEnhance(description) {
    if (!targetRepo?.trim()) return
    setState('streaming')
    setStreamText('')

    try {
      const response = await fetch(`${API_BASE}/improve-prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description, mode, targetRepo }),
      })

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: 'Request failed' }))
        setData(err); setState('error'); return
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value: chunk } = await reader.read()
        if (done) break

        buffer += decoder.decode(chunk, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() // keep incomplete trailing line

        for (const line of lines) {
          if (!line.trim()) continue
          try {
            const event = JSON.parse(line)
            if (event.chunk) {
              setStreamText(t => t + event.chunk)
            } else if (event.done) {
              const result = event.result
              setData(result)
              if (result.action === 'rewrite') {
                setEditedResult(result.result)
                setState('rewritten')
              } else {
                setState('questions')
              }
            } else if (event.error) {
              setData({ error: event.error })
              setState('error')
            }
          } catch { /* skip malformed line */ }
        }
      }
    } catch (e) {
      setData({ error: e.message })
      setState('error')
    }
  }

  function handleEnhance() {
    runEnhance(value)
  }

  function handleSubmitAnswers() {
    const combined =
      value.trim() +
      '\n\nAdditional context:\n' +
      data.result.map((q, i) => `- ${q}\n  → ${answers[i] || ''}`).join('\n')
    runEnhance(combined)
  }

  function handleAccept() {
    onRewrite?.(editedResult)
    setState('idle')
    setData(null)
    setEditedResult('')
  }

  function handleDismiss() {
    setState('idle')
    setData(null)
    setEditedResult('')
  }

  return (
    <div className="space-y-2">
      {/* Enhance button or repo-required hint */}
      {state === 'idle' && (
        hasRepo ? (
          <button
            type="button"
            onClick={handleEnhance}
            className="flex items-center gap-1.5 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
            Enhance with AI
          </button>
        ) : (
          <p className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500">
            <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
            Select a target repository to enable <span className="font-medium text-gray-500 dark:text-gray-400">Enhance with AI</span>
          </p>
        )
      )}

      {/* Streaming — live output from Claude */}
      {state === 'streaming' && (
        <div className="border border-indigo-200 dark:border-indigo-800 rounded-lg overflow-hidden">
          <div className="px-3 py-2 bg-indigo-50 dark:bg-indigo-950 border-b border-indigo-100 dark:border-indigo-900 flex items-center gap-2">
            <svg className="w-3 h-3 text-indigo-500 animate-spin shrink-0" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
            </svg>
            <span className="text-xs font-medium text-indigo-700 dark:text-indigo-300">Exploring codebase…</span>
          </div>
          <div className="px-3 py-2.5 bg-white dark:bg-gray-900 max-h-48 overflow-y-auto">
            <pre className="text-xs text-gray-500 dark:text-gray-400 whitespace-pre-wrap font-mono leading-relaxed">
              {streamText}<span className="animate-pulse text-indigo-400">▋</span>
            </pre>
          </div>
        </div>
      )}

      {/* Claude needs more info */}
      {state === 'questions' && (
        <div className="border border-indigo-200 dark:border-indigo-800 rounded-lg overflow-hidden">
          <div className="px-3 py-2 bg-indigo-50 dark:bg-indigo-950 border-b border-indigo-100 dark:border-indigo-900">
            <p className="text-xs font-semibold text-indigo-700 dark:text-indigo-300">
              A few quick questions to sharpen the prompt
            </p>
            {data.explanation && (
              <p className="text-xs text-indigo-500 dark:text-indigo-400 mt-0.5">{data.explanation}</p>
            )}
          </div>
          <div className="px-3 py-3 space-y-3 bg-white dark:bg-gray-900">
            {data.result.map((q, i) => (
              <div key={i}>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-200 mb-1">{q}</label>
                <input
                  type="text"
                  value={answers[i] || ''}
                  onChange={e => setAnswers(a => ({ ...a, [i]: e.target.value }))}
                  onKeyDown={e => { if (e.key === 'Enter') handleSubmitAnswers() }}
                  placeholder="Your answer…"
                  className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg px-2.5 py-1.5 text-xs focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                  autoFocus={i === 0}
                />
              </div>
            ))}
            <div className="flex items-center gap-3 pt-1">
              <button
                onClick={handleSubmitAnswers}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium rounded-lg transition-colors"
              >
                Rewrite prompt →
              </button>
              <button onClick={handleDismiss} className="text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rewrite result */}
      {state === 'rewritten' && (
        <RewrittenResult
          data={data}
          editedResult={editedResult}
          setEditedResult={setEditedResult}
          onAccept={handleAccept}
          onReEnhance={handleEnhance}
          onDismiss={handleDismiss}
        />
      )}

      {/* Error */}
      {state === 'error' && (
        <div className="flex items-center justify-between px-3 py-2 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg">
          <span className="text-xs text-red-600 dark:text-red-400">{data?.error || 'Something went wrong'}</span>
          <button onClick={handleDismiss} className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 ml-3 transition-colors">Dismiss</button>
        </div>
      )}
    </div>
  )
}
