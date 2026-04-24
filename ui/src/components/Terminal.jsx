import { useEffect, useRef, useState, useCallback } from 'react'

const ANSI_RE = /\x1b\[[0-9;]*[A-Za-z]/g

// taskPath → runs /workflow
// command  → runs any arbitrary claude command string
export default function Terminal({ taskPath, command, autoStart = false, onDone }) {
  const [lines, setLines] = useState([])
  const [running, setRunning] = useState(false)
  const [exitCode, setExitCode] = useState(null)
  const wsRef = useRef(null)
  const bottomRef = useRef(null)

  const addLine = (text, isErr = false) => {
    const clean = text.replace(ANSI_RE, '')
    if (!clean) return
    setLines(prev => [...prev, { text: clean, isErr }])
  }

  const start = useCallback(() => {
    if (running || wsRef.current) return

    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const ws = new WebSocket(`${protocol}://${window.location.host}/ws`)
    wsRef.current = ws

    ws.onopen = () => {
      if (taskPath) {
        ws.send(JSON.stringify({ action: 'run-workflow', taskPath }))
      } else if (command) {
        ws.send(JSON.stringify({ action: 'run-command', command }))
      }
      setRunning(true)
      setExitCode(null)
      setLines([])
    }

    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data)
      if (msg.type === 'started') {
        addLine(`▶ ${msg.taskPath ? `Running workflow: ${msg.taskPath}` : `Running: ${msg.command}`}\n`)
      } else if (msg.type === 'stdout') {
        addLine(msg.data, false)
      } else if (msg.type === 'stderr') {
        addLine(msg.data, true)
      } else if (msg.type === 'done') {
        setRunning(false)
        setExitCode(msg.code)
        addLine(`\n● Process exited with code ${msg.code}`, msg.code !== 0)
        wsRef.current = null
        onDone?.()
      } else if (msg.type === 'stopped') {
        setRunning(false)
        addLine('\n■ Stopped by user', true)
        wsRef.current = null
      } else if (msg.type === 'error') {
        setRunning(false)
        addLine(`Error: ${msg.message}`, true)
        wsRef.current = null
      }
    }

    ws.onerror = () => {
      setRunning(false)
      addLine('WebSocket error. Is the server running?', true)
      wsRef.current = null
    }

    ws.onclose = () => {
      setRunning(false)
      wsRef.current = null
    }
  }, [taskPath, running, onDone])

  const stop = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.send(JSON.stringify({ action: 'stop' }))
    }
  }, [])

  const clear = useCallback(() => {
    setLines([])
    setExitCode(null)
  }, [])

  // Auto-start on mount if requested
  useEffect(() => {
    if (autoStart) start()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-scroll to bottom on new output
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [lines])

  // Kill WS on unmount
  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }
    }
  }, [])

  const statusDot = running
    ? 'bg-yellow-400 animate-pulse'
    : exitCode === 0
    ? 'bg-green-400'
    : exitCode !== null
    ? 'bg-red-400'
    : 'bg-gray-500'

  return (
    <div className="flex flex-col border border-gray-800 rounded-xl overflow-hidden bg-gray-950 shadow-lg">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-2.5 bg-gray-900 border-b border-gray-800">
        <div className={`w-2 h-2 rounded-full ${statusDot}`} />
        <span className="text-xs font-mono text-gray-400 flex-1">
          {running ? 'Running...' : exitCode === 0 ? 'Completed' : exitCode !== null ? `Exited (${exitCode})` : 'Ready'}
        </span>

        <div className="flex items-center gap-1.5">
          {lines.length > 0 && !running && (
            <button
              onClick={clear}
              className="px-2.5 py-1 text-gray-400 hover:text-gray-200 text-xs rounded-md hover:bg-gray-700 transition-colors"
            >
              Clear
            </button>
          )}
          {running ? (
            <button
              onClick={stop}
              className="px-3 py-1 bg-red-700 hover:bg-red-600 text-white text-xs rounded-md font-medium transition-colors flex items-center gap-1.5"
            >
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                <rect x="6" y="6" width="12" height="12" rx="1" />
              </svg>
              Stop
            </button>
          ) : (
            <button
              onClick={start}
              className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs rounded-md font-medium transition-colors flex items-center gap-1.5"
            >
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
              Run Workflow
            </button>
          )}
        </div>
      </div>

      {/* Output */}
      <div className="overflow-y-auto p-4 min-h-48 max-h-[500px] font-mono text-xs">
        {lines.length === 0 ? (
          <div className="text-gray-600 select-none">
            Click <span className="text-indigo-400">Run Workflow</span> to start the multi-agent pipeline...
          </div>
        ) : (
          lines.map((line, i) => (
            <pre
              key={i}
              className={`whitespace-pre-wrap break-words leading-relaxed ${
                line.isErr ? 'text-red-400' : 'text-green-300'
              }`}
            >
              {line.text}
            </pre>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
