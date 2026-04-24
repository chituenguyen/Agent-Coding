import { useState, useEffect } from 'react'
import { api } from '../api'

const MODELS = [
  { value: 'claude-opus-4-6',           label: 'Claude Opus 4.6',   tag: 'Most capable' },
  { value: 'claude-sonnet-4-6',         label: 'Claude Sonnet 4.6', tag: 'Recommended' },
  { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5',  tag: 'Fastest' },
]

const PERMISSION_MODES = [
  { value: 'default',            label: 'Default',             desc: 'Ask for approval on sensitive actions' },
  { value: 'acceptEdits',        label: 'Accept Edits',        desc: 'Auto-approve file edits, ask for other actions' },
  { value: 'bypassPermissions',  label: 'Bypass Permissions',  desc: 'Skip all permission checks (use with caution)' },
]

// ─── helpers ────────────────────────────────────────────────────────────────

function settingsToForm(s) {
  return {
    model: s.model || '',
    theme: s.theme || 'system',
    verbose: s.verbose ?? false,
    permissionMode: s.permissions?.defaultPermissionMode || 'default',
    allow: (s.permissions?.allow || []).join('\n'),
    deny: (s.permissions?.deny || []).join('\n'),
    additionalDirs: (s.permissions?.additionalDirectories || []).join('\n'),
    env: s.env ? Object.entries(s.env).map(([k, v]) => ({ k, v })) : [{ k: '', v: '' }],
  }
}

function formToSettings(f) {
  const splitLines = (str) => str.split('\n').map(l => l.trim()).filter(Boolean)
  const out = {}
  if (f.model) out.model = f.model
  if (f.theme && f.theme !== 'system') out.theme = f.theme
  else if (f.theme === 'system') out.theme = 'system'
  if (f.verbose) out.verbose = true

  const perms = {}
  if (f.permissionMode && f.permissionMode !== 'default') perms.defaultPermissionMode = f.permissionMode
  const allow = splitLines(f.allow)
  const deny = splitLines(f.deny)
  const dirs = splitLines(f.additionalDirs)
  if (allow.length) perms.allow = allow
  if (deny.length) perms.deny = deny
  if (dirs.length) perms.additionalDirectories = dirs
  if (Object.keys(perms).length) out.permissions = perms

  const envEntries = f.env.filter(e => e.k)
  if (envEntries.length) out.env = Object.fromEntries(envEntries.map(e => [e.k, e.v]))

  return out
}

// ─── main ────────────────────────────────────────────────────────────────────

export default function Settings() {
  const [form, setForm] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    api.getSettings()
      .then(s => setForm(settingsToForm(s)))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  function patch(updates) {
    setForm(f => ({ ...f, ...updates }))
    setSaved(false)
  }

  async function save() {
    setSaving(true)
    setError(null)
    try {
      await api.saveSettings(formToSettings(form))
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading || !form) return (
    <div className="p-8 flex items-center gap-2 text-gray-400 dark:text-gray-500 text-sm">
      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
      </svg>
      Loading settings...
    </div>
  )

  return (
    <div className="p-8 max-w-2xl">
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Settings</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Global Claude Code settings — saved to <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded text-xs">~/.claude/settings.json</code>
          </p>
        </div>
        <button
          onClick={save}
          disabled={saving}
          className={`flex items-center gap-2 px-5 py-2 text-sm font-medium rounded-lg transition-colors ${
            saved
              ? 'bg-green-600 text-white'
              : 'bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50'
          }`}
        >
          {saving ? (
            <>
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
              Saving...
            </>
          ) : saved ? (
            <>
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
              </svg>
              Saved
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
              </svg>
              Save Changes
            </>
          )}
        </button>
      </div>

      {error && (
        <div className="mb-6 p-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-400">{error}</div>
      )}

      <div className="space-y-6">

        {/* Model */}
        <Section title="Default Model" icon="🤖" description="Model used when no model is specified in the task.">
          <div className="space-y-2">
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Model</label>
            <div className="grid gap-2">
              {MODELS.map(m => (
                <label
                  key={m.value}
                  className={`flex items-center gap-3 p-3 border rounded-xl cursor-pointer transition-colors ${
                    form.model === m.value
                      ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950'
                      : 'border-gray-200 dark:border-gray-700 hover:border-indigo-300 bg-white dark:bg-gray-900'
                  }`}
                >
                  <input
                    type="radio"
                    name="model"
                    value={m.value}
                    checked={form.model === m.value}
                    onChange={() => patch({ model: m.value })}
                    className="text-indigo-600"
                  />
                  <div className="flex-1">
                    <span className="text-sm font-medium text-gray-800 dark:text-gray-100">{m.label}</span>
                    <code className="text-xs text-gray-400 dark:text-gray-500 font-mono ml-2">{m.value}</code>
                  </div>
                  {m.tag && (
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      m.tag === 'Recommended' ? 'bg-indigo-100 dark:bg-indigo-900 text-indigo-600 dark:text-indigo-300' :
                      m.tag === 'Most capable' ? 'bg-purple-100 dark:bg-purple-900 text-purple-600 dark:text-purple-300' :
                      'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
                    }`}>{m.tag}</span>
                  )}
                </label>
              ))}
              <label className={`flex items-center gap-3 p-3 border rounded-xl cursor-pointer transition-colors ${
                !MODELS.find(m => m.value === form.model)
                  ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950'
                  : 'border-gray-200 dark:border-gray-700 hover:border-indigo-300 bg-white dark:bg-gray-900'
              }`}>
                <input
                  type="radio"
                  name="model"
                  value=""
                  checked={!MODELS.find(m => m.value === form.model)}
                  onChange={() => patch({ model: '' })}
                  className="text-indigo-600"
                />
                <span className="text-sm text-gray-500 dark:text-gray-400">Use Claude Code default</span>
              </label>
            </div>
          </div>
        </Section>

        {/* Permissions */}
        <Section title="Permissions" icon="🔐" description="Control what actions Claude can take without asking.">
          {/* Permission mode */}
          <div className="mb-4">
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-2">Permission Mode</label>
            <div className="space-y-2">
              {PERMISSION_MODES.map(pm => (
                <label
                  key={pm.value}
                  className={`flex items-start gap-3 p-3 border rounded-xl cursor-pointer transition-colors ${
                    form.permissionMode === pm.value
                      ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950'
                      : 'border-gray-200 dark:border-gray-700 hover:border-indigo-300 bg-white dark:bg-gray-900'
                  }`}
                >
                  <input
                    type="radio"
                    name="permissionMode"
                    value={pm.value}
                    checked={form.permissionMode === pm.value}
                    onChange={() => patch({ permissionMode: pm.value })}
                    className="mt-0.5 text-indigo-600"
                  />
                  <div>
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-100">{pm.label}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{pm.desc}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Allow list */}
          <div className="mb-4">
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">
              Allow List <span className="font-normal text-gray-400 dark:text-gray-500">— one pattern per line</span>
            </label>
            <textarea
              rows={4}
              value={form.allow}
              onChange={e => patch({ allow: e.target.value })}
              placeholder={"*\nBash(git *)\nWebFetch(domain:github.com)"}
              className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg px-3 py-2 text-xs font-mono focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none resize-none"
            />
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Use <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">*</code> to allow all, or <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">Tool(pattern)</code> for specific tools.</p>
          </div>

          {/* Deny list */}
          <div className="mb-4">
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">
              Deny List <span className="font-normal text-gray-400 dark:text-gray-500">— one pattern per line</span>
            </label>
            <textarea
              rows={3}
              value={form.deny}
              onChange={e => patch({ deny: e.target.value })}
              placeholder={"Bash(rm -rf *)\nBash(sudo *)"}
              className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg px-3 py-2 text-xs font-mono focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none resize-none"
            />
          </div>

          {/* Additional directories */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">
              Additional Directories <span className="font-normal text-gray-400 dark:text-gray-500">— one path per line</span>
            </label>
            <textarea
              rows={3}
              value={form.additionalDirs}
              onChange={e => patch({ additionalDirs: e.target.value })}
              placeholder={"/tmp\n/Users/me/projects"}
              className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg px-3 py-2 text-xs font-mono focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none resize-none"
            />
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Allow Claude to read/write files in these directories.</p>
          </div>
        </Section>

        {/* Environment Variables */}
        <Section title="Environment Variables" icon="🌿" description="Injected into every Claude Code session.">
          <div className="space-y-1.5">
            {form.env.map((row, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  value={row.k}
                  onChange={e => {
                    const next = form.env.map((r, j) => j === i ? { ...r, k: e.target.value } : r)
                    patch({ env: next })
                  }}
                  placeholder="VARIABLE_NAME"
                  className="w-2/5 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg px-2.5 py-1.5 text-xs font-mono focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                />
                <input
                  value={row.v}
                  onChange={e => {
                    const next = form.env.map((r, j) => j === i ? { ...r, v: e.target.value } : r)
                    patch({ env: next })
                  }}
                  placeholder="value"
                  className="flex-1 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg px-2.5 py-1.5 text-xs font-mono focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                />
                <button
                  onClick={() => {
                    const next = form.env.length > 1 ? form.env.filter((_, j) => j !== i) : [{ k: '', v: '' }]
                    patch({ env: next })
                  }}
                  className="p-1 text-gray-300 dark:text-gray-600 hover:text-red-400 transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
            <button
              onClick={() => patch({ env: [...form.env, { k: '', v: '' }] })}
              className="text-xs text-indigo-500 hover:text-indigo-700 transition-colors"
            >
              + Add variable
            </button>
          </div>
        </Section>

        {/* Display */}
        <Section title="Display" icon="🎨" description="Appearance and output preferences.">
          <div className="space-y-4">
            {/* Theme */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-2">Theme</label>
              <div className="flex gap-2">
                {['system', 'light', 'dark'].map(t => (
                  <button
                    key={t}
                    onClick={() => patch({ theme: t })}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium border capitalize transition-colors ${
                      form.theme === t
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-indigo-300 bg-white dark:bg-gray-900'
                    }`}
                  >
                    {t === 'system' ? '🖥 System' : t === 'light' ? '☀️ Light' : '🌙 Dark'}
                  </button>
                ))}
              </div>
            </div>

            {/* Verbose */}
            <label className="flex items-start gap-3 cursor-pointer group">
              <input
                type="checkbox"
                checked={form.verbose}
                onChange={e => patch({ verbose: e.target.checked })}
                className="mt-0.5 w-4 h-4 text-indigo-600 rounded"
              />
              <div>
                <p className="text-sm font-medium text-gray-700 dark:text-gray-200 group-hover:text-gray-900 dark:group-hover:text-white">Verbose output</p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Show detailed logs and tool call information in terminals.</p>
              </div>
            </label>
          </div>
        </Section>

      </div>
    </div>
  )
}

function Section({ title, icon, description, children }) {
  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex items-start gap-3">
        <span className="text-lg leading-none mt-0.5">{icon}</span>
        <div>
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">{title}</h2>
          {description && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{description}</p>}
        </div>
      </div>
      <div className="px-5 py-4">{children}</div>
    </div>
  )
}
