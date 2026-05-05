import { useState, useEffect } from 'react'
import { api } from '../api'
import Modal from '../components/Modal'
import RepoGraph from '../components/RepoGraph'


// ─── enums ─────────────────────────────────────────────────────────────────

const SCOPE = { GLOBAL: 'global', REPO: 'repo' }
const TAB = { REPOS: 'repos', GLOBAL: 'global', CATALOG: 'catalog' }
const TRANSPORT = { STDIO: 'stdio', HTTP: 'http' }
const MODAL_MODE = { ADD: 'add', EDIT: 'edit' }

// ─── helpers ────────────────────────────────────────────────────────────────

const EMPTY_FORM = { name: '', scope: SCOPE.GLOBAL, type: TRANSPORT.STDIO, command: '', args: '', env: [{ k: '', v: '' }], url: '', headers: [{ k: '', v: '' }] }

function configFromForm(f) {
  if (f.type === TRANSPORT.HTTP) {
    const headers = Object.fromEntries(f.headers.filter(h => h.k).map(h => [h.k, h.v]))
    return { type: TRANSPORT.HTTP, url: f.url, ...(Object.keys(headers).length ? { headers } : {}) }
  }
  const args = f.args.trim() ? f.args.trim().split(/\s+/) : []
  const env = Object.fromEntries(f.env.filter(e => e.k).map(e => [e.k, e.v]))
  return { type: TRANSPORT.STDIO, command: f.command.trim(), ...(args.length ? { args } : {}), ...(Object.keys(env).length ? { env } : {}) }
}

function formFromConfig(name, scope, cfg) {
  const isHttp = cfg.type === TRANSPORT.HTTP
  return {
    name, scope, type: isHttp ? TRANSPORT.HTTP : TRANSPORT.STDIO,
    command: cfg.command || '', args: (cfg.args || []).join(' '),
    env: cfg.env ? Object.entries(cfg.env).map(([k, v]) => ({ k, v })) : [{ k: '', v: '' }],
    url: cfg.url || '', headers: cfg.headers ? Object.entries(cfg.headers).map(([k, v]) => ({ k, v })) : [{ k: '', v: '' }],
  }
}

// ─── main component ──────────────────────────────────────────────────────────

export default function Mcp() {
  const [data, setData] = useState({ global: {}, project: {} })
  const [catalog, setCatalog] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState(TAB.REPOS)
  const [modal, setModal] = useState(null)
  const [saving, setSaving] = useState(false)

  // Repositories state
  const [repos, setRepos] = useState([])
  const [reposLoading, setReposLoading] = useState(true)
  const [expandedRepo, setExpandedRepo] = useState(null)
  const [repoMcpServers, setRepoMcpServers] = useState({})
  const [repoModal, setRepoModal] = useState(null)
  const [repoSaving, setRepoSaving] = useState(false)
  const [graphProject, setGraphProject] = useState(null)
  const [catalogTarget, setCatalogTarget] = useState(null) // null = project/global, string = repo name
  const [addRepoModal, setAddRepoModal] = useState(false)
  const [addRepoForm, setAddRepoForm] = useState({ path: '', name: '' })
  const [addRepoSaving, setAddRepoSaving] = useState(false)
  const [catalogModal, setCatalogModal] = useState(false)
  const [catalogForm, setCatalogForm] = useState({ name: '', label: '', icon: '🔌', category: '', description: '', command: '', args: '', env: [{ k: '', v: '' }] })
  const [catalogSaving, setCatalogSaving] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const [mcp, cat] = await Promise.all([api.getMcp(), api.getCatalog()])
      setData(mcp)
      setCatalog(cat)
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }

  async function loadRepos() {
    setReposLoading(true)
    try { setRepos(await api.getRepositories()) } catch { /* ignore */ } finally { setReposLoading(false) }
  }

  useEffect(() => { load(); loadRepos() }, [])

  // ─── Workspace/Global MCP handlers ───
  function openAdd(prefill = {}) {
    setModal({ mode: MODAL_MODE.ADD, form: { ...EMPTY_FORM, scope: SCOPE.GLOBAL, ...prefill } })
  }
  function openEdit(scope, name, cfg) {
    setModal({ mode: MODAL_MODE.EDIT, form: formFromConfig(name, scope, cfg) })
  }
  async function handleSave() {
    const { form } = modal
    if (!form.name.trim()) return
    setSaving(true)
    try { await api.upsertMcp(form.scope, form.name.trim(), configFromForm(form)); await load(); setModal(null) }
    catch (err) { alert('Failed to save: ' + err.message) }
    finally { setSaving(false) }
  }
  async function handleDelete(scope, name) {
    if (!confirm(`Remove "${name}" from ${scope} MCPs?`)) return
    await api.deleteMcp(scope, name); load()
  }
  async function handleCatalogAdd(item) {
    const hasEmptyEnv = item.config.env && Object.values(item.config.env).some(v => v === '')

    if (catalogTarget) {
      // Adding to a specific repo
      if (hasEmptyEnv) {
        setRepoModal({ project: catalogTarget, mode: MODAL_MODE.ADD, form: { ...formFromConfig(item.name, SCOPE.REPO, item.config), scope: SCOPE.REPO } })
      } else {
        await api.upsertRepoMcp(catalogTarget, item.name, item.config)
        loadRepos()
        // Refresh expanded repo servers
        if (expandedRepo === catalogTarget) {
          const d = await api.getRepoMcp(catalogTarget); setRepoMcpServers(d.mcpServers || {})
        }
        setActiveTab(TAB.REPOS)
        setCatalogTarget(null)
      }
    } else {
      // Adding to global scope
      if (hasEmptyEnv) {
        setModal({ mode: MODAL_MODE.ADD, form: formFromConfig(item.name, 'global', item.config) })
      } else {
        await api.upsertMcp(SCOPE.GLOBAL, item.name, item.config); load(); setActiveTab(TAB.GLOBAL)
      }
    }
  }

  // ─── Add repository handlers ───
  async function handleBrowseRepoPath() {
    try {
      const { path: p } = await api.browseFolder('Select repository folder')
      const autoName = p.split('/').pop().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
      setAddRepoForm(f => ({ ...f, path: p, name: f.name || autoName }))
    } catch { /* cancelled */ }
  }
  async function handleAddRepo() {
    if (!addRepoForm.path.trim()) return
    setAddRepoSaving(true)
    try {
      await api.createRepository({ path: addRepoForm.path.trim(), name: addRepoForm.name.trim() || undefined })
      setAddRepoModal(false)
      setAddRepoForm({ path: '', name: '' })
      await loadRepos()
    } catch (err) { alert('Failed to add repository: ' + err.message) }
    finally { setAddRepoSaving(false) }
  }
  async function handleDeleteRepo(name) {
    if (!confirm(`Remove repository "${name}"?\n\nThe projects/${name}/ folder (task history, context) will be kept.`)) return
    try { await api.deleteRepository(name); await loadRepos() }
    catch (err) { alert('Failed to remove: ' + err.message) }
  }

  // ─── Catalog handlers ───
  async function handleAddCatalog() {
    if (!catalogForm.name.trim() || !catalogForm.command.trim()) return
    setCatalogSaving(true)
    try {
      const args = catalogForm.args.trim() ? catalogForm.args.trim().split(/\s+/) : []
      const env = Object.fromEntries(catalogForm.env.filter(e => e.k).map(e => [e.k, e.v]))
      const item = {
        name: catalogForm.name.trim(),
        label: catalogForm.label.trim() || catalogForm.name.trim(),
        icon: catalogForm.icon || '🔌',
        category: catalogForm.category.trim() || 'Other',
        description: catalogForm.description.trim(),
        config: { type: 'stdio', command: catalogForm.command.trim(), ...(args.length ? { args } : {}), ...(Object.keys(env).length ? { env } : {}) },
      }
      await api.upsertCatalog(item)
      await load()
      setCatalogModal(false)
      setCatalogForm({ name: '', label: '', icon: '🔌', category: '', description: '', command: '', args: '', env: [{ k: '', v: '' }] })
    } catch (err) { alert('Failed to save: ' + err.message) }
    finally { setCatalogSaving(false) }
  }

  // ─── Repo MCP handlers ───
  async function toggleRepo(name) {
    if (expandedRepo === name) { setExpandedRepo(null); return }
    setExpandedRepo(name)
    try { const d = await api.getRepoMcp(name); setRepoMcpServers(d.mcpServers || {}) }
    catch { setRepoMcpServers({}) }
  }
  function openRepoAdd(project) {
    setRepoModal({ project, mode: MODAL_MODE.ADD, form: { ...EMPTY_FORM, scope: SCOPE.REPO } })
  }
  function openRepoEdit(project, name, cfg) {
    setRepoModal({ project, mode: MODAL_MODE.EDIT, form: { ...formFromConfig(name, SCOPE.REPO, cfg), scope: SCOPE.REPO } })
  }
  async function handleRepoSave() {
    const { project, form } = repoModal
    if (!form.name.trim()) return
    setRepoSaving(true)
    try {
      await api.upsertRepoMcp(project, form.name.trim(), configFromForm(form))
      const d = await api.getRepoMcp(project); setRepoMcpServers(d.mcpServers || {})
      loadRepos(); setRepoModal(null)
    } catch (err) { alert('Failed to save: ' + err.message) }
    finally { setRepoSaving(false) }
  }
  async function handleRepoDelete(project, name) {
    if (!confirm(`Remove "${name}" from ${project}?`)) return
    await api.deleteRepoMcp(project, name)
    const d = await api.getRepoMcp(project); setRepoMcpServers(d.mcpServers || {})
    loadRepos()
  }

  const allNames = [...Object.keys(data.global || {})]
  const repoCount = repos.reduce((sum, r) => sum + r.mcpServerCount, 0)

  const tabs = [
    { key: TAB.REPOS, label: 'Repositories', count: repoCount },
    { key: TAB.GLOBAL, label: 'Global', count: Object.keys(data.global).length },
    { key: TAB.CATALOG, label: 'Catalog', count: null },
  ]

  return (
    <div className="p-8 max-w-4xl">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">MCP Servers</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Manage Model Context Protocol servers — workspace, global, and per-repository
          </p>
        </div>
        {activeTab === TAB.REPOS && (
          <button onClick={() => { setAddRepoForm({ path: '', name: '' }); setAddRepoModal(true) }}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Repository
          </button>
        )}
        {activeTab === TAB.CATALOG && (
          <button onClick={() => setCatalogModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add to Catalog
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-6 border-b border-gray-200 dark:border-gray-700">
        {tabs.map(tab => (
          <button key={tab.key} onClick={() => { setActiveTab(tab.key); if (tab.key !== TAB.CATALOG) setCatalogTarget(null) }}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              activeTab === tab.key ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
            }`}>
            {tab.label}
            {tab.count !== null && (
              <span className={`ml-2 text-xs px-1.5 py-0.5 rounded-full ${activeTab === tab.key ? 'bg-indigo-100 dark:bg-indigo-900 text-indigo-600 dark:text-indigo-400' : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'}`}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ─── Content ─── */}
      {activeTab === TAB.CATALOG ? (
        <>
          {catalogTarget && (
            <div className="mb-4 flex items-center gap-2 px-3 py-2 bg-indigo-50 dark:bg-indigo-950 border border-indigo-200 dark:border-indigo-800 rounded-lg">
              <svg className="w-4 h-4 text-indigo-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
              </svg>
              <p className="text-sm text-indigo-700 dark:text-indigo-300 flex-1">
                Adding to repository: <strong>{catalogTarget}</strong>
              </p>
              <button onClick={() => setCatalogTarget(null)} className="text-xs text-indigo-500 hover:text-indigo-700 dark:hover:text-indigo-300">
                Clear
              </button>
            </div>
          )}
          <CatalogView items={catalog} existingNames={allNames} onAdd={handleCatalogAdd} />
        </>
      ) : activeTab === TAB.REPOS ? (
        /* ─── Repositories tab ─── */
        reposLoading ? <LoadingSpinner /> : repos.length === 0 ? (
          <div className="text-center py-16 text-gray-400 dark:text-gray-500">
            <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-gray-300 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
              </svg>
            </div>
            <p className="font-medium text-gray-600 dark:text-gray-300">No repositories yet</p>
            <p className="text-sm mt-1">Create a task with a target repo to add one</p>
          </div>
        ) : (
          <div className="space-y-2">
            {repos.map(repo => (
              <div key={repo.name} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
                {/* Repo header */}
                <div className="flex items-center gap-3 px-4 py-3.5">
                  <button onClick={() => toggleRepo(repo.name)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                    <svg className="w-5 h-5 text-indigo-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
                    </svg>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-gray-900 dark:text-white">{repo.name}</span>
                        {repo.mcpServerCount > 0 && (
                          <span className="text-xs px-1.5 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900 text-indigo-600 dark:text-indigo-400">
                            {repo.mcpServerCount} MCP
                          </span>
                        )}
                      </div>
                      {repo.repoPath && <p className="text-xs text-gray-400 dark:text-gray-500 font-mono truncate mt-0.5">{repo.repoPath}</p>}
                    </div>
                    <svg className={`w-4 h-4 text-gray-400 transition-transform shrink-0 ${expandedRepo === repo.name ? 'rotate-180' : ''}`}
                      fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {repo.repoPath && (
                    <button onClick={() => setGraphProject(repo.name)} title="View code graph"
                      className="px-3 py-1.5 text-xs font-medium text-indigo-500 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-950 transition-colors shrink-0">
                      Graph
                    </button>
                  )}
                  <button onClick={(e) => { e.stopPropagation(); handleDeleteRepo(repo.name) }}
                    title="Remove repository" className="p-1.5 text-gray-400 hover:text-red-500 rounded-md hover:bg-red-50 dark:hover:bg-red-950 transition-colors shrink-0">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>

                {/* Expanded: MCP servers for this repo */}
                {expandedRepo === repo.name && (
                  <div className="border-t border-gray-100 dark:border-gray-800 px-4 py-4">
                    {Object.keys(repoMcpServers).length === 0 ? (
                      <div className="text-center py-6 text-gray-400 dark:text-gray-500">
                        <p className="text-sm">No MCP servers for this repository</p>
                        <button onClick={() => { setCatalogTarget(repo.name); setActiveTab(TAB.CATALOG) }}
                          className="mt-3 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors">
                          Browse Catalog
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {Object.entries(repoMcpServers).map(([name, cfg]) => (
                          <ServerCard key={name} name={name} cfg={cfg}
                            onEdit={() => openRepoEdit(repo.name, name, cfg)}
                            onDelete={() => handleRepoDelete(repo.name, name)} />
                        ))}
                        <button onClick={() => { setCatalogTarget(repo.name); setActiveTab(TAB.CATALOG) }}
                          className="w-full py-2 border border-dashed border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-400 dark:text-gray-500 hover:border-indigo-400 hover:text-indigo-500 transition-colors">
                          + Browse Catalog
                        </button>
                      </div>
                    )}
                    <div className="mt-4 p-2.5 bg-gray-50 dark:bg-gray-800 rounded-lg text-xs text-gray-400 dark:text-gray-500">
                      Stored at <code className="bg-gray-200 dark:bg-gray-700 px-1 rounded">projects/{repo.name}/mcp.json</code> — auto-loaded when workflows run for this repo.
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )
      ) : activeTab === TAB.GLOBAL ? (
        /* ─── Global tab ─── */
        loading ? <LoadingSpinner /> : Object.keys(data.global).length === 0 ? (
          <div className="text-center py-16 text-gray-400 dark:text-gray-500">
            <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-gray-300 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </div>
            <p className="font-medium text-gray-600 dark:text-gray-300">No global MCP servers</p>
            <p className="text-sm mt-1">Global servers are available in all Claude sessions</p>
            <div className="flex items-center gap-2 justify-center mt-4">
              <button onClick={() => openAdd()} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors">Add Server</button>
              <button onClick={() => setActiveTab(TAB.CATALOG)} className="px-4 py-2 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-indigo-300 hover:text-indigo-600 text-sm font-medium rounded-lg transition-colors">Browse Catalog</button>
            </div>
          </div>
        ) : (
          <>
            <div className="space-y-2">
              {Object.entries(data.global).map(([name, cfg]) => (
                <ServerCard key={name} name={name} cfg={cfg}
                  onEdit={() => openEdit(SCOPE.GLOBAL, name, cfg)}
                  onDelete={() => handleDelete(SCOPE.GLOBAL, name)} />
              ))}
              <button onClick={() => setActiveTab(TAB.CATALOG)}
                className="w-full mt-2 py-2.5 border border-dashed border-gray-300 dark:border-gray-600 rounded-xl text-sm text-gray-400 dark:text-gray-500 hover:border-indigo-400 hover:text-indigo-500 transition-colors">
                + Browse catalog to add more
              </button>
            </div>
            <div className="mt-6 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400">
              <strong className="text-gray-600 dark:text-gray-300">Global scope</strong> — stored in <code className="bg-gray-200 dark:bg-gray-700 px-1 rounded">~/.claude.json</code>. Available in all Claude sessions.
            </div>
          </>
        )
      ) : null}

      {/* Add to Catalog Modal */}
      {catalogModal && (
        <Modal title="Add to Catalog" onClose={() => setCatalogModal(false)}
          footer={<>
            <button onClick={() => setCatalogModal(false)} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors">Cancel</button>
            <button onClick={handleAddCatalog} disabled={catalogSaving || !catalogForm.name.trim() || !catalogForm.command.trim()}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
              {catalogSaving ? 'Saving...' : 'Add to Catalog'}
            </button>
          </>}>
          <div className="space-y-4">
            <div className="flex gap-3">
              <div className="w-20">
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Icon</label>
                <input value={catalogForm.icon} onChange={e => setCatalogForm(f => ({ ...f, icon: e.target.value }))} placeholder="🔌"
                  className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg px-3 py-2 text-sm text-center focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none" />
              </div>
              <div className="flex-1">
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Name <span className="font-normal text-gray-400">(unique ID)</span></label>
                <input value={catalogForm.name} onChange={e => setCatalogForm(f => ({ ...f, name: e.target.value }))} placeholder="my-server"
                  className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none" />
              </div>
              <div className="flex-1">
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Label <span className="font-normal text-gray-400">(display)</span></label>
                <input value={catalogForm.label} onChange={e => setCatalogForm(f => ({ ...f, label: e.target.value }))} placeholder="My Server"
                  className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none" />
              </div>
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Category</label>
                <input value={catalogForm.category} onChange={e => setCatalogForm(f => ({ ...f, category: e.target.value }))} placeholder="Storage, Web, Services..."
                  className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Description</label>
              <input value={catalogForm.description} onChange={e => setCatalogForm(f => ({ ...f, description: e.target.value }))} placeholder="What this MCP server does"
                className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Command</label>
              <input value={catalogForm.command} onChange={e => setCatalogForm(f => ({ ...f, command: e.target.value }))} placeholder="npx or /path/to/uvx"
                className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Args <span className="font-normal text-gray-400">(space-separated)</span></label>
              <input value={catalogForm.args} onChange={e => setCatalogForm(f => ({ ...f, args: e.target.value }))} placeholder="-y @modelcontextprotocol/server-name"
                className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-2">Environment Variables <span className="font-normal text-gray-400">(optional)</span></label>
              <KVEditor rows={catalogForm.env} onChange={env => setCatalogForm(f => ({ ...f, env }))} keyPlaceholder="API_KEY" valPlaceholder="value" />
            </div>
          </div>
        </Modal>
      )}

      {/* Graph overlay */}
      {graphProject && <RepoGraph project={graphProject} onClose={() => setGraphProject(null)} />}

      {/* Workspace/Global MCP Modal */}
      {modal && (
        <McpModal modal={modal} saving={saving}
          onChange={patch => setModal(m => ({ ...m, form: { ...m.form, ...patch } }))}
          onSave={handleSave} onClose={() => setModal(null)} />
      )}

      {/* Repo MCP Modal */}
      {repoModal && (
        <McpModal modal={repoModal} saving={repoSaving}
          onChange={patch => setRepoModal(m => ({ ...m, form: { ...m.form, ...patch } }))}
          onSave={handleRepoSave} onClose={() => setRepoModal(null)} isRepo />
      )}

      {/* Add Repository Modal */}
      {addRepoModal && (
        <Modal title="Add Repository" onClose={() => setAddRepoModal(false)}
          footer={<>
            <button onClick={() => setAddRepoModal(false)} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors">Cancel</button>
            <button onClick={handleAddRepo} disabled={addRepoSaving || !addRepoForm.path.trim()}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
              {addRepoSaving ? 'Adding...' : 'Add Repository'}
            </button>
          </>}>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Repository Path</label>
              <div className="flex gap-2">
                <input value={addRepoForm.path} onChange={e => setAddRepoForm(f => ({ ...f, path: e.target.value }))}
                  placeholder="/path/to/repo" readOnly
                  className="flex-1 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none bg-gray-50 dark:bg-gray-800 cursor-default" />
                <button onClick={handleBrowseRepoPath}
                  className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-600 dark:text-gray-300 hover:border-indigo-400 hover:text-indigo-600 transition-colors whitespace-nowrap">
                  Browse...
                </button>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">
                Name <span className="font-normal text-gray-400">(optional — auto-derived from folder name)</span>
              </label>
              <input value={addRepoForm.name} onChange={e => setAddRepoForm(f => ({ ...f, name: e.target.value }))}
                placeholder={addRepoForm.path ? addRepoForm.path.split('/').pop().toLowerCase().replace(/[^a-z0-9]+/g, '-') : 'my-project'}
                className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none" />
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ─── Shared components ──────────────────────────────────────────────────────

function LoadingSpinner() {
  return (
    <div className="flex items-center gap-2 text-gray-400 dark:text-gray-500 text-sm py-8">
      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
      </svg>
      Loading...
    </div>
  )
}

function ServerCard({ name, cfg, onEdit, onDelete }) {
  const [open, setOpen] = useState(false)
  const isHttp = cfg.type === TRANSPORT.HTTP
  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3">
        <div className={`w-2 h-2 rounded-full shrink-0 ${isHttp ? 'bg-blue-400' : 'bg-green-400'}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-900 dark:text-white">{name}</span>
            <span className={`text-xs px-1.5 py-0.5 rounded font-mono ${isHttp ? 'bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400' : 'bg-green-50 dark:bg-green-950 text-green-600 dark:text-green-400'}`}>
              {isHttp ? TRANSPORT.HTTP : TRANSPORT.STDIO}
            </span>
          </div>
          <p className="text-xs text-gray-400 dark:text-gray-500 font-mono truncate mt-0.5">
            {isHttp ? cfg.url : `${cfg.command}${cfg.args?.length ? ' ' + cfg.args.join(' ') : ''}`}
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={() => setOpen(o => !o)} className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" title="Details">
            <svg className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          <button onClick={onEdit} className="p-1.5 text-gray-400 hover:text-indigo-600 rounded-md hover:bg-indigo-50 dark:hover:bg-indigo-950 transition-colors" title="Edit">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
          <button onClick={onDelete} className="p-1.5 text-gray-400 hover:text-red-500 rounded-md hover:bg-red-50 dark:hover:bg-red-950 transition-colors" title="Remove">
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

function CatalogView({ items, existingNames, onAdd }) {
  // Group by category
  const groups = items.reduce((acc, item) => {
    const cat = item.category || 'Other'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(item)
    return acc
  }, {})

  return (
    <div className="space-y-6">
      {Object.entries(groups).map(([category, groupItems]) => (
        <div key={category}>
          <h3 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">{category}</h3>
          <div className="grid grid-cols-2 gap-3">
            {groupItems.map(item => {
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
                    <button onClick={() => onAdd(item)}
                      className={`mt-2.5 text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${installed ? 'text-gray-500 border border-gray-200 dark:border-gray-700 hover:border-indigo-300 hover:text-indigo-600' : 'bg-indigo-600 hover:bg-indigo-700 text-white'}`}>
                      {installed ? 'Re-configure' : 'Add'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

function KVEditor({ rows, onChange, keyPlaceholder = 'key', valPlaceholder = 'value' }) {
  function update(i, field, val) { onChange(rows.map((r, j) => j === i ? { ...r, [field]: val } : r)) }
  return (
    <div className="space-y-1.5">
      {rows.map((row, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <input value={row.k} onChange={e => update(i, 'k', e.target.value)} placeholder={keyPlaceholder}
            className="w-2/5 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg px-2.5 py-1.5 text-xs font-mono focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none" />
          <input value={row.v} onChange={e => update(i, 'v', e.target.value)} placeholder={valPlaceholder}
            className="flex-1 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg px-2.5 py-1.5 text-xs font-mono focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none" />
          <button onClick={() => onChange(rows.length > 1 ? rows.filter((_, j) => j !== i) : [{ k: '', v: '' }])}
            className="p-1 text-gray-300 dark:text-gray-600 hover:text-red-400 transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      ))}
      <button onClick={() => onChange([...rows, { k: '', v: '' }])} className="text-xs text-indigo-500 hover:text-indigo-700 transition-colors">+ Add row</button>
    </div>
  )
}

function McpModal({ modal, saving, onChange, onSave, onClose, isRepo }) {
  const { mode, form, project } = modal
  const isEdit = mode === MODAL_MODE.EDIT
  return (
    <Modal
      title={isEdit ? `Edit "${form.name}"` : isRepo ? `Add MCP to ${project}` : 'Add MCP Server'}
      onClose={onClose}
      footer={<>
        <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors">Cancel</button>
        <button onClick={onSave} disabled={saving || !form.name.trim()}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
          {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Add Server'}
        </button>
      </>}>
      <div className="space-y-4">
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Server Name</label>
            <input value={form.name} onChange={e => onChange({ name: e.target.value })} disabled={isEdit} placeholder="my-server"
              className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none disabled:bg-gray-50 dark:disabled:bg-gray-800 disabled:text-gray-400" />
          </div>
          {!isRepo && (
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Scope</label>
              <select value={form.scope} onChange={e => onChange({ scope: e.target.value })} disabled={isEdit}
                className="border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none disabled:bg-gray-50 dark:disabled:bg-gray-800 bg-white">
                <option value="project">Project</option>
                <option value="global">Global</option>
              </select>
            </div>
          )}
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-2">Type</label>
          <div className="flex gap-2">
            {[TRANSPORT.STDIO, TRANSPORT.HTTP].map(t => (
              <button key={t} onClick={() => onChange({ type: t })}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium border transition-colors ${form.type === t ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-indigo-300'}`}>
                {t}
              </button>
            ))}
          </div>
        </div>
        {form.type === TRANSPORT.STDIO ? (<>
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Command</label>
            <input value={form.command} onChange={e => onChange({ command: e.target.value })} placeholder="npx"
              className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Args <span className="font-normal text-gray-400">(space-separated)</span></label>
            <input value={form.args} onChange={e => onChange({ args: e.target.value })} placeholder="-y @modelcontextprotocol/server-filesystem /"
              className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-2">Environment Variables</label>
            <KVEditor rows={form.env} onChange={env => onChange({ env })} keyPlaceholder="VAR_NAME" valPlaceholder="value" />
          </div>
        </>) : (<>
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">URL</label>
            <input value={form.url} onChange={e => onChange({ url: e.target.value })} placeholder="https://mcp.example.com/mcp"
              className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-2">Headers</label>
            <KVEditor rows={form.headers} onChange={headers => onChange({ headers })} keyPlaceholder="Authorization" valPlaceholder="Bearer token..." />
          </div>
        </>)}
      </div>
    </Modal>
  )
}
