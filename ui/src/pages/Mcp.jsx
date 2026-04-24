import { useState, useEffect } from 'react'
import { api } from '../api'
import Modal from '../components/Modal'

// ─── Popular MCP catalog ────────────────────────────────────────────────────

const CATALOG = [
  {
    name: 'filesystem',
    label: 'Filesystem',
    description: 'Read and write files on your local machine',
    icon: '📁',
    config: { type: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem', '/'] },
  },
  {
    name: 'github',
    label: 'GitHub',
    description: 'Search repos, read files, manage issues and PRs',
    icon: '🐙',
    config: { type: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-github'], env: { GITHUB_PERSONAL_ACCESS_TOKEN: '' } },
  },
  {
    name: 'brave-search',
    label: 'Brave Search',
    description: 'Web and local search via Brave Search API',
    icon: '🔍',
    config: { type: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-brave-search'], env: { BRAVE_API_KEY: '' } },
  },
  {
    name: 'postgres',
    label: 'PostgreSQL',
    description: 'Query and inspect PostgreSQL databases',
    icon: '🐘',
    config: { type: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-postgres', 'postgresql://localhost/mydb'] },
  },
  {
    name: 'slack',
    label: 'Slack',
    description: 'Read messages and post to Slack channels',
    icon: '💬',
    config: { type: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-slack'], env: { SLACK_BOT_TOKEN: '', SLACK_TEAM_ID: '' } },
  },
  {
    name: 'puppeteer',
    label: 'Puppeteer',
    description: 'Control a browser, take screenshots, scrape pages',
    icon: '🤖',
    config: { type: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-puppeteer'] },
  },
  {
    name: 'memory',
    label: 'Memory',
    description: 'Persistent knowledge graph memory across sessions',
    icon: '🧠',
    config: { type: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-memory'] },
  },
  {
    name: 'fetch',
    label: 'Fetch',
    description: 'Fetch URLs and convert web pages to markdown',
    icon: '🌐',
    config: { type: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-fetch'] },
  },
  {
    name: 'sqlite',
    label: 'SQLite',
    description: 'Read and query SQLite database files',
    icon: '🗄️',
    config: { type: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-sqlite', 'db.sqlite'] },
  },
  {
    name: 'git',
    label: 'Git',
    description: 'Read git history, diffs, branches in any repo',
    icon: '🌿',
    config: { type: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-git', '--repository', '.'] },
  },
]

// ─── helpers ────────────────────────────────────────────────────────────────

const EMPTY_FORM = {
  name: '',
  scope: 'project',
  type: 'stdio',
  // stdio
  command: '',
  args: '',
  env: [{ k: '', v: '' }],
  // http
  url: '',
  headers: [{ k: '', v: '' }],
}

function configFromForm(f) {
  if (f.type === 'http') {
    const headers = Object.fromEntries(f.headers.filter(h => h.k).map(h => [h.k, h.v]))
    return { type: 'http', url: f.url, ...(Object.keys(headers).length ? { headers } : {}) }
  }
  const args = f.args.trim() ? f.args.trim().split(/\s+/) : []
  const env = Object.fromEntries(f.env.filter(e => e.k).map(e => [e.k, e.v]))
  return {
    type: 'stdio',
    command: f.command.trim(),
    ...(args.length ? { args } : {}),
    ...(Object.keys(env).length ? { env } : {}),
  }
}

function formFromConfig(name, scope, cfg) {
  const isHttp = cfg.type === 'http'
  return {
    name,
    scope,
    type: isHttp ? 'http' : 'stdio',
    command: cfg.command || '',
    args: (cfg.args || []).join(' '),
    env: cfg.env ? Object.entries(cfg.env).map(([k, v]) => ({ k, v })) : [{ k: '', v: '' }],
    url: cfg.url || '',
    headers: cfg.headers ? Object.entries(cfg.headers).map(([k, v]) => ({ k, v })) : [{ k: '', v: '' }],
  }
}

// ─── main component ──────────────────────────────────────────────────────────

export default function Mcp() {
  const [data, setData] = useState({ global: {}, project: {} })
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('project') // 'project' | 'global' | 'catalog'
  const [modal, setModal] = useState(null) // null | { mode: 'add'|'edit', form }
  const [saving, setSaving] = useState(false)

  async function load() {
    setLoading(true)
    try { setData(await api.getMcp()) } catch { /* ignore */ } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  function openAdd(prefill = {}) {
    setModal({ mode: 'add', form: { ...EMPTY_FORM, scope: activeTab === 'global' ? 'global' : 'project', ...prefill } })
  }

  function openEdit(scope, name, cfg) {
    setModal({ mode: 'edit', form: formFromConfig(name, scope, cfg) })
  }

  async function handleSave() {
    const { form } = modal
    if (!form.name.trim()) return
    setSaving(true)
    try {
      await api.upsertMcp(form.scope, form.name.trim(), configFromForm(form))
      await load()
      setModal(null)
    } catch (err) {
      alert('Failed to save: ' + err.message)
    } finally { setSaving(false) }
  }

  async function handleDelete(scope, name) {
    if (!confirm(`Remove "${name}" from ${scope} MCPs?`)) return
    await api.deleteMcp(scope, name)
    load()
  }

  async function handleCatalogAdd(item) {
    const scope = activeTab === 'global' ? 'global' : 'project'
    // If config has empty env values, open modal so user can fill them in
    const hasEmptyEnv = item.config.env && Object.values(item.config.env).some(v => v === '')
    if (hasEmptyEnv) {
      setModal({
        mode: 'add',
        form: formFromConfig(item.name, scope, item.config),
      })
    } else {
      await api.upsertMcp(scope, item.name, item.config)
      load()
      setActiveTab(scope)
    }
  }

  const servers = activeTab === 'global' ? data.global : data.project
  const allNames = [...Object.keys(data.global), ...Object.keys(data.project)]

  return (
    <div className="p-8 max-w-4xl">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">MCP Servers</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Manage Model Context Protocol servers for Claude
          </p>
        </div>
        {activeTab !== 'catalog' && (
          <button
            onClick={() => openAdd()}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Server
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-6 border-b border-gray-200 dark:border-gray-700">
        {[
          { key: 'project', label: 'Project', count: Object.keys(data.project).length },
          { key: 'global', label: 'Global (user)', count: Object.keys(data.global).length },
          { key: 'catalog', label: '✦ Browse Catalog', count: null },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              activeTab === tab.key
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
            }`}
          >
            {tab.label}
            {tab.count !== null && (
              <span className={`ml-2 text-xs px-1.5 py-0.5 rounded-full ${activeTab === tab.key ? 'bg-indigo-100 text-indigo-600' : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'}`}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center gap-2 text-gray-400 dark:text-gray-500 text-sm py-8">
          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
          </svg>
          Loading...
        </div>
      ) : activeTab === 'catalog' ? (
        <CatalogView items={CATALOG} existingNames={allNames} onAdd={handleCatalogAdd} />
      ) : Object.keys(servers).length === 0 ? (
        <div className="text-center py-16 text-gray-400 dark:text-gray-500">
          <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-gray-300 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </div>
          <p className="font-medium text-gray-600 dark:text-gray-300">No {activeTab} MCP servers</p>
          <p className="text-sm mt-1">Add one manually or browse the catalog</p>
          <div className="flex items-center gap-2 justify-center mt-4">
            <button onClick={() => openAdd()} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors">
              Add Server
            </button>
            <button onClick={() => setActiveTab('catalog')} className="px-4 py-2 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-indigo-300 hover:text-indigo-600 text-sm font-medium rounded-lg transition-colors">
              Browse Catalog
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {Object.entries(servers).map(([name, cfg]) => (
            <ServerCard
              key={name}
              name={name}
              cfg={cfg}
              scope={activeTab}
              onEdit={() => openEdit(activeTab, name, cfg)}
              onDelete={() => handleDelete(activeTab, name)}
            />
          ))}
          <button
            onClick={() => setActiveTab('catalog')}
            className="w-full mt-2 py-2.5 border border-dashed border-gray-300 dark:border-gray-600 rounded-xl text-sm text-gray-400 dark:text-gray-500 hover:border-indigo-400 hover:text-indigo-500 transition-colors"
          >
            + Browse catalog to add more
          </button>
        </div>
      )}

      {/* Scope info */}
      {activeTab !== 'catalog' && (
        <div className="mt-6 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400">
          {activeTab === 'project'
            ? <><strong className="text-gray-600 dark:text-gray-300">Project scope</strong> — stored in <code className="bg-gray-200 dark:bg-gray-700 px-1 rounded">.mcp.json</code> at workspace root. Only active in this workspace.</>
            : <><strong className="text-gray-600 dark:text-gray-300">Global scope</strong> — stored in <code className="bg-gray-200 dark:bg-gray-700 px-1 rounded">~/.claude.json</code>. Available in all Claude sessions.</>
          }
        </div>
      )}

      {/* Modal */}
      {modal && (
        <McpModal
          modal={modal}
          saving={saving}
          onChange={patch => setModal(m => ({ ...m, form: { ...m.form, ...patch } }))}
          onSave={handleSave}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  )
}

// ─── ServerCard ──────────────────────────────────────────────────────────────

function ServerCard({ name, cfg, onEdit, onDelete }) {
  const [open, setOpen] = useState(false)
  const isHttp = cfg.type === 'http'

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3">
        <div className={`w-2 h-2 rounded-full shrink-0 ${isHttp ? 'bg-blue-400' : 'bg-green-400'}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-900 dark:text-white">{name}</span>
            <span className={`text-xs px-1.5 py-0.5 rounded font-mono ${isHttp ? 'bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400' : 'bg-green-50 dark:bg-green-950 text-green-600 dark:text-green-400'}`}>
              {isHttp ? 'http' : 'stdio'}
            </span>
          </div>
          <p className="text-xs text-gray-400 dark:text-gray-500 font-mono truncate mt-0.5">
            {isHttp ? cfg.url : `${cfg.command}${cfg.args?.length ? ' ' + cfg.args.join(' ') : ''}`}
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={() => setOpen(o => !o)} className="p-1.5 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" title="Details">
            <svg className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          <button onClick={onEdit} className="p-1.5 text-gray-400 dark:text-gray-500 hover:text-indigo-600 rounded-md hover:bg-indigo-50 dark:hover:bg-indigo-950 transition-colors" title="Edit">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
          <button onClick={onDelete} className="p-1.5 text-gray-400 dark:text-gray-500 hover:text-red-500 rounded-md hover:bg-red-50 dark:hover:bg-red-950 transition-colors" title="Remove">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>
      {open && (
        <div className="px-4 pb-3 pt-0 border-t border-gray-100 dark:border-gray-800">
          <pre className="text-xs font-mono text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-800 rounded-lg p-3 overflow-x-auto">
            {JSON.stringify(cfg, null, 2)}
          </pre>
        </div>
      )}
    </div>
  )
}

// ─── CatalogView ─────────────────────────────────────────────────────────────

function CatalogView({ items, existingNames, onAdd }) {
  return (
    <div>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
        One-click add popular MCP servers. Servers with required API keys will open a config form first.
      </p>
      <div className="grid grid-cols-2 gap-3">
        {items.map(item => {
          const installed = existingNames.includes(item.name)
          return (
            <div key={item.name} className={`bg-white dark:bg-gray-900 border rounded-xl p-4 flex items-start gap-3 ${installed ? 'border-green-200 dark:border-green-800 bg-green-50/30 dark:bg-green-950/30' : 'border-gray-200 dark:border-gray-700 hover:border-indigo-300'} transition-colors`}>
              <span className="text-2xl shrink-0">{item.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-gray-900 dark:text-white">{item.label}</span>
                  {installed && <span className="text-xs text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900 px-1.5 py-0.5 rounded-full">Added</span>}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">{item.description}</p>
                <div className="flex items-center gap-2 mt-2.5">
                  <button
                    onClick={() => onAdd(item)}
                    className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                      installed
                        ? 'text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700 hover:border-indigo-300 hover:text-indigo-600'
                        : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                    }`}
                  >
                    {installed ? 'Re-configure' : 'Add'}
                  </button>
                  <span className="text-xs text-gray-400 dark:text-gray-500 font-mono truncate">{item.config.command} {item.config.args?.[1]}</span>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── McpModal ────────────────────────────────────────────────────────────────

function KVEditor({ rows, onChange, keyPlaceholder = 'key', valPlaceholder = 'value' }) {
  function update(i, field, val) {
    const next = rows.map((r, j) => j === i ? { ...r, [field]: val } : r)
    onChange(next)
  }
  function add() { onChange([...rows, { k: '', v: '' }]) }
  function remove(i) { onChange(rows.length > 1 ? rows.filter((_, j) => j !== i) : [{ k: '', v: '' }]) }

  return (
    <div className="space-y-1.5">
      {rows.map((row, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <input
            value={row.k}
            onChange={e => update(i, 'k', e.target.value)}
            placeholder={keyPlaceholder}
            className="w-2/5 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg px-2.5 py-1.5 text-xs font-mono focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
          />
          <input
            value={row.v}
            onChange={e => update(i, 'v', e.target.value)}
            placeholder={valPlaceholder}
            className="flex-1 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg px-2.5 py-1.5 text-xs font-mono focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
          />
          <button onClick={() => remove(i)} className="p-1 text-gray-300 dark:text-gray-600 hover:text-red-400 transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      ))}
      <button onClick={add} className="text-xs text-indigo-500 hover:text-indigo-700 transition-colors">+ Add row</button>
    </div>
  )
}

function McpModal({ modal, saving, onChange, onSave, onClose }) {
  const { mode, form } = modal
  const isEdit = mode === 'edit'

  return (
    <Modal
      title={isEdit ? `Edit "${form.name}"` : 'Add MCP Server'}
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors">Cancel</button>
          <button
            onClick={onSave}
            disabled={saving || !form.name.trim()}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Add Server'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {/* Name + Scope */}
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Server Name</label>
            <input
              value={form.name}
              onChange={e => onChange({ name: e.target.value })}
              disabled={isEdit}
              placeholder="my-server"
              className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none disabled:bg-gray-50 dark:disabled:bg-gray-800 disabled:text-gray-400"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Scope</label>
            <select
              value={form.scope}
              onChange={e => onChange({ scope: e.target.value })}
              disabled={isEdit}
              className="border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none disabled:bg-gray-50 dark:disabled:bg-gray-800 bg-white"
            >
              <option value="project">Project</option>
              <option value="global">Global</option>
            </select>
          </div>
        </div>

        {/* Type */}
        <div>
          <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-2">Type</label>
          <div className="flex gap-2">
            {['stdio', 'http'].map(t => (
              <button
                key={t}
                onClick={() => onChange({ type: t })}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                  form.type === t ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-indigo-300'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {form.type === 'stdio' ? (
          <>
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Command</label>
              <input
                value={form.command}
                onChange={e => onChange({ command: e.target.value })}
                placeholder="npx"
                className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Args <span className="font-normal text-gray-400 dark:text-gray-500">(space-separated)</span></label>
              <input
                value={form.args}
                onChange={e => onChange({ args: e.target.value })}
                placeholder="-y @modelcontextprotocol/server-filesystem /"
                className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-2">Environment Variables</label>
              <KVEditor rows={form.env} onChange={env => onChange({ env })} keyPlaceholder="VAR_NAME" valPlaceholder="value" />
            </div>
          </>
        ) : (
          <>
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">URL</label>
              <input
                value={form.url}
                onChange={e => onChange({ url: e.target.value })}
                placeholder="https://mcp.example.com/mcp"
                className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-2">Headers</label>
              <KVEditor rows={form.headers} onChange={headers => onChange({ headers })} keyPlaceholder="Authorization" valPlaceholder="Bearer token..." />
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
