import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'

const ROLE_STYLES = {
  user: 'bg-amber-500 text-white shadow-md shadow-amber-200/50 dark:shadow-none',
  assistant: 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-700/60 shadow-sm',
}

const MODELS = [
  { id: 'sonnet', label: 'Sonnet 4.6' },
  { id: 'opus',   label: 'Opus 4.7' },
  { id: 'haiku',  label: 'Haiku 4.5' },
]

function friendlyToolLabel(name, input = {}) {
  if (!name) return 'Working...'
  if (name === 'Task') return `Delegating to ${input.subagent_type || 'sub-agent'}`
  if (name === 'ToolSearch') return 'Looking up tools'
  if (name === 'Read') {
    const f = input.file_path || ''
    return f ? `Reading ${f.split('/').pop()}` : 'Reading file'
  }
  if (name === 'Write') return 'Writing file'
  if (name === 'Edit') return 'Editing file'
  if (name === 'Bash') return 'Running command'
  if (name === 'Grep') return 'Searching code'
  if (name === 'Glob') return 'Finding files'
  if (name === 'WebFetch' || name === 'WebSearch') return 'Searching the web'
  if (name === 'TodoWrite') return 'Updating notes'
  if (name.startsWith('mcp__')) {
    const parts = name.split('__')
    const action = parts[parts.length - 1].replace(/_/g, ' ')
    const server = parts[1]?.replace(/_/g, ' ')
    return `${server}: ${action}`
  }
  return name
}

function FolderRow({ repo, selected, onPick, onHover }) {
  const ref = useRef(null)
  useEffect(() => {
    if (selected) ref.current?.scrollIntoView({ block: 'nearest' })
  }, [selected])
  return (
    <button
      ref={ref}
      type="button"
      onMouseEnter={onHover}
      onClick={onPick}
      className={`w-full text-left px-3 py-2 border-b border-gray-100 dark:border-gray-800 last:border-0 flex items-center gap-2 transition-colors ${
        selected ? 'bg-amber-100 dark:bg-amber-900/40' : 'hover:bg-amber-50 dark:hover:bg-amber-900/20'
      }`}
    >
      <span className="text-base">📁</span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-gray-900 dark:text-gray-100">@{repo.name}</div>
        <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{repo.repoPath}</div>
      </div>
    </button>
  )
}

function FolderMentionPopup({ matched, selectedIndex, onPick, onHover }) {
  if (matched.length === 0) return null
  return (
    <div className="absolute z-30 bottom-full mb-2 left-0 w-96 max-h-72 overflow-y-auto bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl">
      <div className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-950 border-b border-gray-100 dark:border-gray-800">
        Folders
      </div>
      {matched.map((r, i) => (
        <FolderRow
          key={r.name}
          repo={r}
          selected={i === selectedIndex}
          onPick={() => onPick(r)}
          onHover={() => onHover(i)}
        />
      ))}
    </div>
  )
}

function MessageBlock({ msg }) {
  return (
    <div className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} mb-4`}>
      <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${ROLE_STYLES[msg.role]} shadow-sm`}>
        <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed">{msg.content}</pre>
      </div>
    </div>
  )
}

function StreamingBubble({ toolEvents, streamText }) {
  const [showDetails, setShowDetails] = useState(false)
  const latest = toolEvents[toolEvents.length - 1]?.label
  return (
    <div className="flex justify-start mb-4">
      <div className="max-w-[85%] rounded-2xl px-4 py-2.5 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-700/60 shadow-sm">
        {toolEvents.length > 0 && (
          <div className="mb-2">
            <button
              type="button"
              onClick={() => setShowDetails(s => !s)}
              className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
            >
              <span className="flex items-center gap-1">
                <span className="w-1 h-1 bg-amber-500 rounded-full animate-pulse" />
                <span className="w-1 h-1 bg-amber-500 rounded-full animate-pulse" style={{ animationDelay: '200ms' }} />
                <span className="w-1 h-1 bg-amber-500 rounded-full animate-pulse" style={{ animationDelay: '400ms' }} />
              </span>
              <span>{latest || 'Investigating'}</span>
              <span className="text-gray-400 dark:text-gray-500">· {toolEvents.length} step{toolEvents.length === 1 ? '' : 's'}</span>
              <svg className={`w-3 h-3 transition-transform ${showDetails ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {showDetails && (
              <div className="mt-1.5 pl-3 border-l-2 border-gray-300 dark:border-gray-700 space-y-0.5">
                {toolEvents.map((t, i) => (
                  <div key={i} className="text-xs text-gray-500 dark:text-gray-400">{t.label}</div>
                ))}
              </div>
            )}
          </div>
        )}
        {streamText ? (
          <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed">{streamText}</pre>
        ) : (
          <div className="flex items-center gap-1 py-1">
            <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
            <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
            <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
        )}
      </div>
    </div>
  )
}

function PushModal({ defaultDescription, defaultTarget, onCancel, onConfirm }) {
  const [desc, setDesc] = useState(defaultDescription || '')
  const [target, setTarget] = useState(defaultTarget || '')
  const [autoFix, setAutoFix] = useState(true)

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onCancel}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800">
          <h3 className="text-base font-semibold text-gray-900 dark:text-white">Push to queue</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Queue worker will run <code className="px-1 bg-gray-100 dark:bg-gray-800 rounded">/investigate</code> with this description.
          </p>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">Bug description</label>
            <textarea
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              rows={5}
              className="w-full text-sm border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 dark:text-gray-100 rounded-lg px-3 py-2 focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none resize-none"
              placeholder="Refined bug description (root cause if known)..."
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">Target folder</label>
            <input
              type="text"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              className="w-full text-sm font-mono border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 dark:text-gray-100 rounded-lg px-3 py-2 focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none"
              placeholder="/Users/.../path"
            />
          </div>
          <label className="flex items-start gap-2.5 cursor-pointer">
            <input type="checkbox" checked={autoFix} onChange={(e) => setAutoFix(e.target.checked)} className="mt-0.5 w-4 h-4 text-amber-500 rounded border-gray-300 dark:border-gray-600 focus:ring-amber-500" />
            <div>
              <div className="text-sm font-medium text-gray-700 dark:text-gray-200">Auto-fix <code className="text-xs bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 rounded ml-0.5">--fix</code></div>
              <div className="text-xs text-gray-400 dark:text-gray-500">Apply the fix after re-confirming the root cause</div>
            </div>
          </label>
        </div>
        <div className="px-5 py-3 bg-gray-50 dark:bg-gray-950 border-t border-gray-100 dark:border-gray-800 flex justify-end gap-2">
          <button onClick={onCancel} className="px-4 py-1.5 text-sm font-medium rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-800">
            Cancel
          </button>
          <button
            onClick={() => onConfirm({ description: desc.trim(), target: target.trim(), autoFix })}
            disabled={!desc.trim()}
            className="px-4 py-1.5 text-sm font-medium rounded-lg bg-amber-500 hover:bg-amber-600 disabled:bg-gray-300 dark:disabled:bg-gray-700 disabled:cursor-not-allowed text-white shadow-sm"
          >
            Push to queue
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Investigate() {
  const [chats, setChats] = useState([])
  const [activeId, setActiveId] = useState(null)
  const [activeChat, setActiveChat] = useState(null)
  const [repos, setRepos] = useState([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [streamText, setStreamText] = useState('')
  const [toolEvents, setToolEvents] = useState([])
  const [mentionQuery, setMentionQuery] = useState(null)
  const [mentionIndex, setMentionIndex] = useState(0)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [modelMenuOpen, setModelMenuOpen] = useState(false)
  const [pushOpen, setPushOpen] = useState(false)
  const [pushState, setPushState] = useState('idle') // idle | loading | done

  const wsRef = useRef(null)
  const bottomRef = useRef(null)
  const inputRef = useRef(null)
  const navigate = useNavigate()

  useEffect(() => {
    refreshChats()
    api.getRepositories().then(setRepos).catch(() => {})
  }, [])

  async function refreshChats() {
    try {
      const list = await api.getChats('investigate')
      setChats(list)
      if (!activeId && list.length > 0) selectChat(list[0].id)
    } catch {}
  }

  async function selectChat(id) {
    setActiveId(id)
    setStreamText('')
    setToolEvents([])
    try {
      const chat = await api.getChat(id)
      setActiveChat(chat)
    } catch {}
  }

  async function newInvestigation() {
    const c = await api.createChat({ kind: 'investigate', agent: 'investigator' })
    setChats(prev => [c, ...prev])
    selectChat(c.id)
  }

  async function deleteChat(id, e) {
    e.stopPropagation()
    if (!confirm('Delete this investigation?')) return
    await api.deleteChat(id)
    setChats(prev => prev.filter(c => c.id !== id))
    if (activeId === id) {
      setActiveId(null)
      setActiveChat(null)
    }
  }

  async function setChatModel(modelId) {
    if (!activeChat) return
    setModelMenuOpen(false)
    const updated = await api.updateChat(activeChat.id, { model: modelId })
    setActiveChat(updated)
  }

  async function addFolder(repo) {
    if (!activeChat) return
    const current = activeChat.folderPaths || []
    if (current.includes(repo.repoPath)) return
    const updated = await api.updateChat(activeChat.id, { folderPaths: [...current, repo.repoPath] })
    setActiveChat(updated)
  }

  async function removeFolder(folderPath) {
    if (!activeChat) return
    const next = (activeChat.folderPaths || []).filter(p => p !== folderPath)
    const updated = await api.updateChat(activeChat.id, { folderPaths: next })
    setActiveChat(updated)
  }

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === 1) return wsRef.current
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const ws = new WebSocket(`${protocol}://${window.location.host}/ws`)
    wsRef.current = ws

    const sidebarBump = (chat) => ({
      id: chat.id, title: chat.title, kind: chat.kind, agent: chat.agent,
      createdAt: chat.createdAt, updatedAt: chat.updatedAt,
      messageCount: (chat.messages || []).length,
    })

    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data)
      if (msg.type === 'chat-user-saved') {
        setActiveChat(msg.chat)
        setChats(prev => [sidebarBump(msg.chat), ...prev.filter(c => c.id !== msg.chat.id)])
      } else if (msg.type === 'chat-delta') {
        setStreamText(prev => prev + msg.text)
      } else if (msg.type === 'chat-tool') {
        setToolEvents(prev => [...prev, { label: friendlyToolLabel(msg.name, msg.input) }])
      } else if (msg.type === 'chat-done') {
        setStreaming(false)
        setStreamText('')
        setToolEvents([])
        setActiveChat(msg.chat)
        setChats(prev => [sidebarBump(msg.chat), ...prev.filter(c => c.id !== msg.chat.id)])
      } else if (msg.type === 'chat-stopped') {
        setStreaming(false)
      } else if (msg.type === 'chat-error') {
        setStreaming(false)
        setStreamText(prev => prev + `\n[Error] ${msg.error}`)
      }
    }
    ws.onclose = () => { wsRef.current = null }
    ws.onerror = () => { setStreaming(false) }
    return ws
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [activeChat?.messages, streamText, toolEvents])

  useEffect(() => {
    return () => { if (wsRef.current) wsRef.current.close() }
  }, [])

  function send() {
    if (!input.trim() || streaming || !activeId) return
    const ws = connect()
    const message = input.trim()
    setInput('')
    setStreaming(true)
    setStreamText('')
    setToolEvents([])
    const dispatch = () => ws.send(JSON.stringify({ action: 'chat-send', chatId: activeId, message }))
    if (ws.readyState === 1) dispatch()
    else ws.addEventListener('open', dispatch, { once: true })
  }

  function stop() {
    if (wsRef.current?.readyState === 1) {
      wsRef.current.send(JSON.stringify({ action: 'chat-stop' }))
    }
  }

  const matchedRepos = mentionQuery !== null
    ? repos.filter(r => r.name.toLowerCase().includes(mentionQuery.toLowerCase()))
    : []

  useEffect(() => { setMentionIndex(0) }, [mentionQuery])

  function onInputChange(e) {
    const v = e.target.value
    setInput(v)
    const cursor = e.target.selectionStart
    const before = v.slice(0, cursor)
    const m = before.match(/@([\w-]*)$/)
    setMentionQuery(m ? m[1] : null)
  }

  function pickFolder(repo) {
    addFolder(repo)
    const cursor = inputRef.current?.selectionStart ?? input.length
    const before = input.slice(0, cursor).replace(/@([\w-]*)$/, '')
    const after = input.slice(cursor)
    setInput(before + after)
    setMentionQuery(null)
    setTimeout(() => {
      inputRef.current?.focus()
      inputRef.current?.setSelectionRange(before.length, before.length)
    }, 0)
  }

  function onKeyDown(e) {
    if (mentionQuery !== null && matchedRepos.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setMentionIndex(i => (i + 1) % matchedRepos.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setMentionIndex(i => (i - 1 + matchedRepos.length) % matchedRepos.length)
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        pickFolder(matchedRepos[mentionIndex])
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setMentionQuery(null)
        return
      }
    }
    if (e.key === 'Enter' && !e.shiftKey && mentionQuery === null) {
      e.preventDefault()
      send()
    }
  }

  async function handlePush({ description, target, autoFix }) {
    setPushState('loading')
    try {
      let fullDesc = description
      if (autoFix) fullDesc += ' [--fix]'
      await api.addToQueue({
        description: fullDesc,
        target: target || undefined,
        type: 'investigate',
      })
      setPushState('done')
      setPushOpen(false)
      setTimeout(() => {
        setPushState('idle')
        navigate('/queue')
      }, 800)
    } catch {
      setPushState('idle')
      alert('Failed to push to queue')
    }
  }

  const messages = activeChat?.messages || []
  const currentModel = activeChat?.model || 'sonnet'
  const firstUserMsg = messages.find(m => m.role === 'user')?.content || ''
  const folderPaths = activeChat?.folderPaths || []
  const folderPills = folderPaths.map(p => {
    const repo = repos.find(r => r.repoPath === p)
    return { path: p, name: repo?.name || p.split('/').pop() }
  })
  const customFolders = folderPaths.filter(p => !p.endsWith('/agent-coding'))
  const defaultTarget = customFolders[0] || ''

  return (
    <div className="h-full flex bg-gray-50 dark:bg-gray-950">
      {/* Sidebar */}
      <aside className={`${sidebarOpen ? 'w-72' : 'w-0'} transition-all overflow-hidden border-r border-gray-200 dark:border-gray-800 flex flex-col bg-white dark:bg-gray-900`}>
        <div className="p-3 border-b border-gray-200 dark:border-gray-800">
          <button
            onClick={newInvestigation}
            className="w-full px-3 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium rounded-lg flex items-center justify-center gap-2 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            New investigation
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {chats.length === 0 && (
            <div className="text-center text-xs text-gray-500 dark:text-gray-400 py-8">
              No investigations yet. Start one to find a root cause.
            </div>
          )}
          {chats.map(c => (
            <div
              key={c.id}
              onClick={() => selectChat(c.id)}
              className={`group cursor-pointer px-3 py-2 rounded-lg transition-colors ${
                activeId === c.id
                  ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-900 dark:text-amber-100'
                  : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{c.title}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">{c.messageCount || 0} msgs</div>
                </div>
                <button onClick={(e) => deleteChat(c.id, e)} className="opacity-0 group-hover:opacity-100 p-1 text-gray-500 hover:text-red-500" title="Delete">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      </aside>

      {/* Main area */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 flex items-center gap-3">
          <button
            onClick={() => setSidebarOpen(o => !o)}
            className="p-1.5 text-gray-500 hover:text-gray-900 dark:hover:text-white rounded-md hover:bg-gray-100 dark:hover:bg-gray-800"
            title="Toggle sidebar"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shrink-0">
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
              {activeChat?.title || 'Investigate'}
            </h1>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Conversation with the <span className="text-amber-600 dark:text-amber-400 font-medium">investigator</span> agent · push to queue when ready to fix
            </p>
          </div>

          {activeChat && messages.length > 0 && (
            <button
              onClick={() => setPushOpen(true)}
              disabled={pushState === 'loading'}
              className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 disabled:bg-gray-300 dark:disabled:bg-gray-700 text-white text-xs font-medium rounded-md flex items-center gap-1.5 shadow-sm transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
              </svg>
              {pushState === 'done' ? 'Pushed!' : 'Push to queue'}
            </button>
          )}

          {activeChat && (
            <div className="relative">
              <button
                onClick={() => setModelMenuOpen(o => !o)}
                className="px-3 py-1.5 text-xs font-medium border border-gray-300 dark:border-gray-700 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300 flex items-center gap-1.5"
                title="Change model"
              >
                <span>{MODELS.find(m => m.id === currentModel)?.label || currentModel}</span>
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {modelMenuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setModelMenuOpen(false)} />
                  <div className="absolute right-0 mt-1 w-44 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-20">
                    {MODELS.map(m => (
                      <button
                        key={m.id}
                        onClick={() => setChatModel(m.id)}
                        className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-800 first:rounded-t-lg last:rounded-b-lg flex items-center justify-between ${
                          currentModel === m.id ? 'text-amber-600 dark:text-amber-400 font-medium' : 'text-gray-700 dark:text-gray-300'
                        }`}
                      >
                        {m.label}
                        {currentModel === m.id && (
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Folder pills */}
        {folderPills.length > 0 && (
          <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 flex flex-wrap items-center gap-2">
            <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">Working in:</span>
            {folderPills.map(f => (
              <span
                key={f.path}
                className="inline-flex items-center gap-1.5 px-2 py-1 bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 text-xs rounded-md font-mono"
                title={f.path}
              >
                📁 {f.name}
                <button onClick={() => removeFolder(f.path)} className="hover:text-red-500" title="Remove">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-6">
          {!activeId ? (
            <div className="h-full flex flex-col items-center justify-center text-center px-4">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg shadow-amber-200/50 dark:shadow-amber-900/30 mb-3">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-1">Start an investigation</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md">
                Describe the bug, then talk it through with the investigator agent until you've nailed the root cause.
              </p>
              <button onClick={newInvestigation} className="mt-4 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium rounded-lg">
                New investigation
              </button>
            </div>
          ) : messages.length === 0 && !streaming ? (
            <div className="h-full flex flex-col items-center justify-center text-center px-4">
              <p className="text-sm text-gray-600 dark:text-gray-400 max-w-md">
                Describe the bug — symptoms, where it shows up, error messages, repro steps. The investigator will dig in and ask follow-up questions.
              </p>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto">
              {messages.map((m, i) => <MessageBlock key={i} msg={m} />)}
              {streaming && <StreamingBubble toolEvents={toolEvents} streamText={streamText} />}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        {/* Input */}
        <div className="border-t border-gray-200 dark:border-gray-800 p-3 bg-white dark:bg-gray-950">
          <div className="max-w-3xl mx-auto relative">
            {mentionQuery !== null && (
              <FolderMentionPopup
                matched={matchedRepos}
                selectedIndex={mentionIndex}
                onPick={pickFolder}
                onHover={setMentionIndex}
              />
            )}
            <div className="flex items-end gap-2 border border-gray-300 dark:border-gray-700 rounded-2xl px-3 py-2 bg-white dark:bg-gray-900 shadow-sm focus-within:border-amber-500 focus-within:ring-2 focus-within:ring-amber-100 dark:focus-within:ring-amber-900/40 transition-all">
              <textarea
                ref={inputRef}
                value={input}
                onChange={onInputChange}
                onKeyDown={onKeyDown}
                placeholder={activeId ? "Describe the bug or @ for folder mention..." : "Create an investigation first"}
                disabled={!activeId || streaming}
                rows={1}
                className="flex-1 resize-none bg-transparent text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none max-h-40"
                style={{ minHeight: '24px' }}
                onInput={(e) => {
                  e.target.style.height = 'auto'
                  e.target.style.height = Math.min(e.target.scrollHeight, 160) + 'px'
                }}
              />
              {streaming ? (
                <button onClick={stop} className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white text-xs rounded-lg font-medium">
                  Stop
                </button>
              ) : (
                <button
                  onClick={send}
                  disabled={!input.trim() || !activeId}
                  className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 disabled:bg-gray-300 dark:disabled:bg-gray-700 disabled:cursor-not-allowed text-white text-xs rounded-lg font-medium"
                >
                  Send
                </button>
              )}
            </div>
            <p className="text-xs text-gray-400 dark:text-gray-600 mt-1.5 px-1">
              Enter to send · Shift+Enter for newline · @ to mention a folder
            </p>
          </div>
        </div>
      </main>

      {pushOpen && (
        <PushModal
          defaultDescription={firstUserMsg}
          defaultTarget={defaultTarget}
          onCancel={() => setPushOpen(false)}
          onConfirm={handlePush}
        />
      )}
    </div>
  )
}
