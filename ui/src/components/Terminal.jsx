import { useEffect, useRef, useState, useCallback } from 'react'

const ANSI_RE = /\x1b\[[0-9;]*[A-Za-z]/g

// taskPath → runs /workflow (persistent, survives navigation)
// command  → runs any arbitrary claude command string (ephemeral)
export default function Terminal({ taskPath, command, autoStart = false, onDone, onRunningChange, readOnly = false }) {
  const [lines, setLines] = useState([])
  const [running, setRunning] = useState(false)
  const [exitCode, setExitCode] = useState(null)
  const [reconnected, setReconnected] = useState(false) // true = showing replayed output
  const wsRef = useRef(null)
  const bottomRef = useRef(null)
  const retryRef = useRef(0)

  const addLine = (text, isErr = false) => {
    const clean = text.replace(ANSI_RE, '')
    if (!clean) return
    setLines(prev => [...prev, { text: clean, isErr }])
  }

  // Connect WebSocket for live streaming (new workflow or live updates after reconnect)
  const connectLive = useCallback((action, payload) => {
    if (wsRef.current) { wsRef.current.close(); wsRef.current = null }

    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const ws = new WebSocket(`${protocol}://${window.location.host}/ws`)
    wsRef.current = ws

    ws.onopen = () => {
      retryRef.current = 0
      console.log('[Terminal] WS connected, action:', action)
      ws.send(JSON.stringify({ action, ...payload }))
      setRunning(true)
      setExitCode(null)
      if (action === 'run-workflow' || action === 'run-command') {
        setLines([])
        setReconnected(false)
      }
      // For subscribe: don't clear lines — we already loaded history via REST
    }

    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data)
      if (msg.type === 'started') {
        if (action === 'run-workflow' || action === 'run-command') {
          addLine(`▶ ${msg.taskPath ? `Running workflow: ${msg.taskPath}` : `Running: ${msg.command}`}\n`)
        }
        // For subscribe: skip — history already loaded
      } else if (msg.type === 'stdout') {
        // For subscribe: skip replayed lines (already loaded via REST)
        // Only add truly new lines that arrive AFTER the subscribe handshake
        if (action !== 'subscribe') {
          addLine(msg.data, false)
        }
      } else if (msg.type === 'stderr') {
        if (action !== 'subscribe') {
          addLine(msg.data, true)
        }
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
      } else if (msg.type === 'not-found') {
        setRunning(false)
        wsRef.current = null
      }
    }

    // After subscribe replay is done, switch to forwarding new messages
    // The server sends all buffered output, then continues with live output
    // We need to detect when replay ends and live starts
    // Strategy: after first batch of messages, flip to live mode
    if (action === 'subscribe') {
      let replayDone = false
      let skipped = 0
      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data)
        if (!replayDone && (msg.type === 'stdout' || msg.type === 'stderr')) {
          skipped++
          return
        }
        if (msg.type === 'started') {
          console.log('[Terminal] Subscribe: skipping replay, waiting for live data...')
          setTimeout(() => {
            replayDone = true
            console.log('[Terminal] Subscribe: replay done, skipped', skipped, 'msgs. Now live.')
          }, 500)
          return
        }
        // Everything else (done, error, stopped) or post-replay live data
        replayDone = true
        // Re-assign to normal handler for all future messages
        ws.onmessage = (e2) => {
          const m = JSON.parse(e2.data)
          if (m.type === 'stdout') addLine(m.data, false)
          else if (m.type === 'stderr') addLine(m.data, true)
          else if (m.type === 'done') {
            setRunning(false)
            setExitCode(m.code)
            addLine(`\n● Process exited with code ${m.code}`, m.code !== 0)
            wsRef.current = null
            onDone?.()
          } else if (m.type === 'stopped') {
            setRunning(false)
            addLine('\n■ Stopped by user', true)
            wsRef.current = null
          } else if (m.type === 'error') {
            setRunning(false)
            addLine(`Error: ${m.message}`, true)
            wsRef.current = null
          }
        }
        // Also handle this current message
        ws.onmessage(e)
      }
    }

    ws.onerror = () => {
      wsRef.current = null
      if (action === 'subscribe' && retryRef.current < 3) {
        retryRef.current++
        setTimeout(() => connectLive(action, payload), 2000)
      } else {
        setRunning(false)
        addLine('WebSocket error. Is the server running?', true)
      }
    }

    ws.onclose = () => {
      wsRef.current = null
    }
  }, [onDone])

  const start = useCallback(() => {
    if (taskPath) {
      connectLive('run-workflow', { taskPath })
    } else if (command) {
      connectLive('run-command', { command })
    }
  }, [taskPath, command, connectLive])

  const stop = useCallback(() => {
    // Try WS first (works when subscribed), REST as reliable fallback
    if (wsRef.current) {
      wsRef.current.send(JSON.stringify({ action: 'stop' }))
    }
    if (taskPath) {
      fetch(`/api/workflows/${encodeURIComponent(taskPath)}/stop`, { method: 'POST' })
        .then(() => { setRunning(false); addLine('\n■ Stopped by user', true) })
        .catch(() => {})
    }
  }, [taskPath])

  const clear = useCallback(() => {
    setLines([])
    setExitCode(null)
    setReconnected(false)
  }, [])

  // On mount: check if a workflow is already running or finished
  useEffect(() => {
    if (!taskPath) return

    async function checkRunning() {
      console.log('[Terminal] checkRunning for', taskPath)
      try {
        const res = await fetch(`/api/workflows/${encodeURIComponent(taskPath)}`)
        const data = await res.json()
        console.log('[Terminal] REST response:', { running: data.running, lines: data.output?.length, exitCode: data.exitCode })
        if (data.running) {
          // Load history from REST (instant, no jitter)
          const historyLines = (data.output || []).map(l => ({
            text: l.text.replace(ANSI_RE, ''),
            isErr: l.isErr,
          })).filter(l => l.text)
          console.log('[Terminal] Loading', historyLines.length, 'history lines, subscribing for live')
          setLines(historyLines)
          setReconnected(true)
          setRunning(true)
          // Then subscribe for live updates only
          connectLive('subscribe', { taskPath })
        } else if (data.output && data.output.length > 0) {
          // Finished while away — show buffered output
          const historyLines = (data.output || []).map(l => ({
            text: l.text.replace(ANSI_RE, ''),
            isErr: l.isErr,
          })).filter(l => l.text)
          console.log('[Terminal] Finished workflow, showing', historyLines.length, 'history lines')
          setLines(historyLines)
          setReconnected(true)
          setExitCode(data.exitCode)
        } else {
          console.log('[Terminal] No running workflow found')
          if (autoStart) start()
        }
      } catch (e) {
        console.log('[Terminal] checkRunning error:', e.message)
        if (autoStart) start()
      }
    }

    checkRunning()
  }, [taskPath]) // eslint-disable-line react-hooks/exhaustive-deps

  // Poll to detect externally-started workflows (e.g. queue cron)
  useEffect(() => {
    if (!taskPath || running || exitCode !== null) return
    const poll = setInterval(async () => {
      try {
        const res = await fetch(`/api/workflows/${encodeURIComponent(taskPath)}`)
        const data = await res.json()
        if (data.running) {
          clearInterval(poll)
          const historyLines = (data.output || []).map(l => ({
            text: l.text.replace(ANSI_RE, ''),
            isErr: l.isErr,
          })).filter(l => l.text)
          setLines(historyLines)
          setReconnected(true)
          setRunning(true)
          connectLive('subscribe', { taskPath })
        } else if (data.output && data.output.length > 0) {
          clearInterval(poll)
          const historyLines = (data.output || []).map(l => ({
            text: l.text.replace(ANSI_RE, ''),
            isErr: l.isErr,
          })).filter(l => l.text)
          setLines(historyLines)
          setReconnected(true)
          setExitCode(data.exitCode)
          onDone?.()
        }
      } catch { /* ignore */ }
    }, 3000)
    return () => clearInterval(poll)
  }, [taskPath, running, exitCode]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-start for non-workflow commands
  useEffect(() => {
    if (autoStart && command && !taskPath) start()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Notify parent of running state changes
  useEffect(() => { onRunningChange?.(running) }, [running])

  // Auto-scroll to bottom on new output
  useEffect(() => {
    if (!reconnected) {
      // Live output — smooth scroll
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    } else {
      // Replayed output — instant scroll, no animation
      bottomRef.current?.scrollIntoView()
    }
  }, [lines])

  // Disconnect WS on unmount (but don't kill the server process)
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
          ) : !readOnly ? (
            <button
              onClick={start}
              className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs rounded-md font-medium transition-colors flex items-center gap-1.5"
            >
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
              Run Workflow
            </button>
          ) : null}
        </div>
      </div>

      {/* Output */}
      <div className="overflow-y-auto p-4 min-h-48 max-h-[500px] font-mono text-xs">
        {lines.length === 0 ? (
          <div className="text-gray-600 select-none">
            {readOnly ? 'No workflow output.' : <>Click <span className="text-indigo-400">Run Workflow</span> to start the multi-agent pipeline...</>}
          </div>
        ) : (
          <>
            {reconnected && (
              <div className="text-gray-600 text-center text-xs mb-3 pb-2 border-b border-gray-800">
                ── Previous output ──
              </div>
            )}
            {lines.map((line, i) => (
              <pre
                key={i}
                className={`whitespace-pre-wrap break-words leading-relaxed ${
                  line.isErr ? 'text-red-400' : 'text-green-300'
                }`}
              >
                {line.text}
              </pre>
            ))}
          </>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
