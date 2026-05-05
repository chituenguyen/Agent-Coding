import { useState, useEffect, useRef, useCallback } from 'react'
import { api } from '../api'

const ROLE_STYLES = {
  user: 'bg-indigo-600 text-white',
  assistant: 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100',
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
  if (name === 'TodoWrite') return 'Updating task list'
  // MCP tools — strip prefixes for readability
  if (name.startsWith('mcp__')) {
    const parts = name.split('__')
    const action = parts[parts.length - 1].replace(/_/g, ' ')
    const server = parts[1]?.replace(/_/g, ' ')
    return `${server}: ${action}`
  }
  return name
}

function MentionPopup({ agents, repos, query, onPickAgent, onPickFolder }) {
  const q = query.toLowerCase()
  const matchedAgents = agents.filter(a => (a.name || a.filename || '').toLowerCase().includes(q))
  const matchedRepos = repos.filter(r => r.name.toLowerCase().includes(q))
  if (matchedAgents.length === 0 && matchedRepos.length === 0) return null

  return (
    <div className="absolute z-30 bottom-full mb-2 left-0 w-96 max-h-72 overflow-y-auto bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl">
      {matchedRepos.length > 0 && (
        <>
          <div className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-950 border-b border-gray-100 dark:border-gray-800">
            Folders
          </div>
          {matchedRepos.map(r => (
            <button
              key={r.name}
              type="button"
              onClick={() => onPickFolder(r)}
              className="w-full text-left px-3 py-2 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 border-b border-gray-100 dark:border-gray-800 last:border-0 flex items-center gap-2"
            >
              <span className="text-base">📁</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-900 dark:text-gray-100">@{r.name}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{r.repoPath}</div>
              </div>
            </button>
          ))}
        </>
      )}
      {matchedAgents.length > 0 && (
        <>
          <div className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-950 border-b border-gray-100 dark:border-gray-800">
            Agents
          </div>
          {matchedAgents.map(a => (
            <button
              key={a.filename}
              type="button"
              onClick={() => onPickAgent(a)}
              className="w-full text-left px-3 py-2 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 border-b border-gray-100 dark:border-gray-800 last:border-0 flex items-center gap-2"
            >
              <span className="text-base">🤖</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-900 dark:text-gray-100">@{a.name || a.filename}</div>
                {a.description && (
                  <div className="text-xs text-gray-500 dark:text-gray-400 line-clamp-1">{a.description}</div>
                )}
              </div>
            </button>
          ))}
        </>
      )}
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
      <div className="max-w-[85%] rounded-2xl px-4 py-2.5 bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 shadow-sm">
        {toolEvents.length > 0 && (
          <div className="mb-2">
            <button
              type="button"
              onClick={() => setShowDetails(s => !s)}
              className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
            >
              <span className="flex items-center gap-1">
                <span className="w-1 h-1 bg-indigo-500 rounded-full animate-pulse" />
                <span className="w-1 h-1 bg-indigo-500 rounded-full animate-pulse" style={{ animationDelay: '200ms' }} />
                <span className="w-1 h-1 bg-indigo-500 rounded-full animate-pulse" style={{ animationDelay: '400ms' }} />
              </span>
              <span>{latest || 'Working'}</span>
              <span className="text-gray-400 dark:text-gray-500">· {toolEvents.length} step{toolEvents.length === 1 ? '' : 's'}</span>
              <svg className={`w-3 h-3 transition-transform ${showDetails ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {showDetails && (
              <div className="mt-1.5 pl-3 border-l-2 border-gray-300 dark:border-gray-700 space-y-0.5">
                {toolEvents.map((t, i) => (
                  <div key={i} className="text-xs text-gray-500 dark:text-gray-400">
                    {t.label}
                  </div>
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

export default function Chat() {
  const [chats, setChats] = useState([])
  const [activeId, setActiveId] = useState(null)
  const [activeChat, setActiveChat] = useState(null)
  const [agents, setAgents] = useState([])
  const [repos, setRepos] = useState([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [streamText, setStreamText] = useState('')
  const [toolEvents, setToolEvents] = useState([])
  const [mentionQuery, setMentionQuery] = useState(null)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [modelMenuOpen, setModelMenuOpen] = useState(false)

  const wsRef = useRef(null)
  const bottomRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    refreshChats()
    api.getAgents().then(setAgents).catch(() => {})
    api.getRepositories().then(setRepos).catch(() => {})
  }, [])

  async function refreshChats() {
    try {
      const list = await api.getChats('chat')
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

  async function newChat() {
    const c = await api.createChat()
    setChats(prev => [c, ...prev])
    selectChat(c.id)
  }

  async function deleteChat(id, e) {
    e.stopPropagation()
    if (!confirm('Delete this chat?')) return
    await api.deleteChat(id)
    setChats(prev => prev.filter(c => c.id !== id))
    if (activeId === id) {
      setActiveId(null)
      setActiveChat(null)
    }
  }

  async function renameChatPrompt(id, e) {
    e.stopPropagation()
    const current = chats.find(c => c.id === id)
    const next = prompt('Rename chat:', current?.title || '')
    if (!next?.trim()) return
    await api.renameChat(id, next.trim())
    refreshChats()
    if (activeId === id) selectChat(id)
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
    const next = [...current, repo.repoPath]
    const updated = await api.updateChat(activeChat.id, { folderPaths: next })
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
      id: chat.id, title: chat.title, createdAt: chat.createdAt, updatedAt: chat.updatedAt,
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
      } else if (msg.type === 'chat-stderr') {
        setToolEvents(prev => [...prev, { kind: 'err', label: msg.data }])
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

  function onInputChange(e) {
    const v = e.target.value
    setInput(v)
    const cursor = e.target.selectionStart
    const before = v.slice(0, cursor)
    const m = before.match(/@([\w-]*)$/)
    setMentionQuery(m ? m[1] : null)
  }

  function pickAgent(agent) {
    const name = agent.name || agent.filename
    const cursor = inputRef.current?.selectionStart ?? input.length
    const before = input.slice(0, cursor).replace(/@([\w-]*)$/, `@${name} `)
    const after = input.slice(cursor)
    setInput(before + after)
    setMentionQuery(null)
    setTimeout(() => {
      inputRef.current?.focus()
      const pos = before.length
      inputRef.current?.setSelectionRange(pos, pos)
    }, 0)
  }

  function pickFolder(repo) {
    addFolder(repo)
    // Strip the @query from the input — folder is attached as a pill instead
    const cursor = inputRef.current?.selectionStart ?? input.length
    const before = input.slice(0, cursor).replace(/@([\w-]*)$/, '')
    const after = input.slice(cursor)
    setInput(before + after)
    setMentionQuery(null)
    setTimeout(() => {
      inputRef.current?.focus()
      const pos = before.length
      inputRef.current?.setSelectionRange(pos, pos)
    }, 0)
  }

  function onKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey && !mentionQuery) {
      e.preventDefault()
      send()
    }
    if (e.key === 'Escape' && mentionQuery !== null) {
      setMentionQuery(null)
    }
  }

  const messages = activeChat?.messages || []
  const currentModel = activeChat?.model || 'sonnet'
  const folderPaths = activeChat?.folderPaths || []
  const folderPills = folderPaths.map(p => {
    const repo = repos.find(r => r.repoPath === p)
    return { path: p, name: repo?.name || p.split('/').pop() }
  })

  return (
    <div className="h-full flex bg-white dark:bg-gray-950">
      {/* Sidebar — chat list */}
      <aside className={`${sidebarOpen ? 'w-72' : 'w-0'} transition-all overflow-hidden border-r border-gray-200 dark:border-gray-800 flex flex-col bg-gray-50 dark:bg-gray-900`}>
        <div className="p-3 border-b border-gray-200 dark:border-gray-800">
          <button
            onClick={newChat}
            className="w-full px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg flex items-center justify-center gap-2 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New chat
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {chats.length === 0 && (
            <div className="text-center text-xs text-gray-500 dark:text-gray-400 py-8">
              No chats yet. Create one to get started.
            </div>
          )}
          {chats.map(c => (
            <div
              key={c.id}
              onClick={() => selectChat(c.id)}
              className={`group cursor-pointer px-3 py-2 rounded-lg transition-colors ${
                activeId === c.id
                  ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-900 dark:text-indigo-100'
                  : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{c.title}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    {c.messageCount || 0} msgs
                  </div>
                </div>
                <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                  <button onClick={(e) => renameChatPrompt(c.id, e)} className="p-1 text-gray-500 hover:text-gray-900 dark:hover:text-white" title="Rename">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                  <button onClick={(e) => deleteChat(c.id, e)} className="p-1 text-gray-500 hover:text-red-500" title="Delete">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </aside>

      {/* Main chat area */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-800 flex items-center gap-3">
          <button
            onClick={() => setSidebarOpen(o => !o)}
            className="p-1.5 text-gray-500 hover:text-gray-900 dark:hover:text-white rounded-md hover:bg-gray-100 dark:hover:bg-gray-800"
            title="Toggle sidebar"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
              {activeChat?.title || 'Chat with orchestrator'}
            </h1>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              <code className="px-1 bg-gray-100 dark:bg-gray-800 rounded">@</code> mentions agents and folders
            </p>
          </div>

          {/* Model dropdown */}
          {activeChat && (
            <div className="relative">
              <button
                onClick={() => setModelMenuOpen(o => !o)}
                className="px-3 py-1.5 text-xs font-medium border border-gray-300 dark:border-gray-700 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300 flex items-center gap-1.5"
                title="Change model"
              >
                <span>Model: {MODELS.find(m => m.id === currentModel)?.label || currentModel}</span>
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
                          currentModel === m.id ? 'text-indigo-600 dark:text-indigo-400 font-medium' : 'text-gray-700 dark:text-gray-300'
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
          <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 flex flex-wrap items-center gap-2">
            <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">Working in:</span>
            {folderPills.map(f => (
              <span
                key={f.path}
                className="inline-flex items-center gap-1.5 px-2 py-1 bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 text-xs rounded-md font-mono"
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
            <div className="h-full flex items-center justify-center text-gray-400 dark:text-gray-600 text-sm">
              Select or create a chat to begin.
            </div>
          ) : messages.length === 0 && !streaming ? (
            <div className="h-full flex flex-col items-center justify-center text-center px-4">
              <div className="w-12 h-12 bg-indigo-100 dark:bg-indigo-900/40 rounded-full flex items-center justify-center mb-3">
                <svg className="w-6 h-6 text-indigo-600 dark:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400 max-w-md">
                Type <code className="px-1 bg-gray-100 dark:bg-gray-800 rounded">@</code> to mention an agent
                {' '}(e.g. <code className="px-1 bg-gray-100 dark:bg-gray-800 rounded">@finance</code>)
                {' '}or a folder to switch the working directory.
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
              <MentionPopup
                agents={agents}
                repos={repos}
                query={mentionQuery}
                onPickAgent={pickAgent}
                onPickFolder={pickFolder}
              />
            )}
            <div className="flex items-end gap-2 border border-gray-300 dark:border-gray-700 rounded-2xl px-3 py-2 bg-white dark:bg-gray-900 focus-within:border-indigo-500 dark:focus-within:border-indigo-400 transition-colors">
              <textarea
                ref={inputRef}
                value={input}
                onChange={onInputChange}
                onKeyDown={onKeyDown}
                placeholder={activeId ? "Message... (@ for agents and folders)" : "Create a chat first"}
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
                <button onClick={stop} className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white text-xs rounded-lg font-medium transition-colors">
                  Stop
                </button>
              ) : (
                <button
                  onClick={send}
                  disabled={!input.trim() || !activeId}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-300 dark:disabled:bg-gray-700 disabled:cursor-not-allowed text-white text-xs rounded-lg font-medium transition-colors"
                >
                  Send
                </button>
              )}
            </div>
            <p className="text-xs text-gray-400 dark:text-gray-600 mt-1.5 px-1">
              Enter to send · Shift+Enter for newline · Esc to close mention
            </p>
          </div>
        </div>
      </main>
    </div>
  )
}
