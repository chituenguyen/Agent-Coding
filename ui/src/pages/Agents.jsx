import { useState, useEffect } from 'react'
import { api } from '../api'
import Modal from '../components/Modal'

const MODEL_OPTIONS = ['sonnet', 'haiku', 'opus', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001', 'claude-opus-4-6']
const inputCls = 'w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none'

// Prompt tone presets — replaces "temperature" for LLM agents
const TONE_PRESETS = [
  {
    id: 'precise',
    label: 'Precise & Strict',
    color: 'blue',
    description: 'Best for coding, reviewing, debugging — deterministic, no extras.',
    snippet: `Be precise and deterministic. Prefer the simplest solution that satisfies the requirement.
Do not add features, abstractions, or improvements beyond what was asked.
Only state what you can verify directly from the code or spec.`,
  },
  {
    id: 'strict-reviewer',
    label: 'Strict Reviewer',
    color: 'red',
    description: 'Best for review/QA agents — rejects anything that deviates from spec.',
    snippet: `Be strict. If anything deviates from the spec, list it — do not approve with reservations.
Every issue must include a file path and line number.
Do not invent issues beyond what the spec requires. The standard is the spec, not personal preference.`,
  },
  {
    id: 'creative',
    label: 'Creative & Exploratory',
    color: 'violet',
    description: 'Best for research, brainstorming, architecture — consider multiple approaches.',
    snippet: `Think broadly. Consider multiple approaches before choosing one.
Surface tradeoffs and alternatives — don't just pick the first solution.
It's okay to explore adjacent ideas if they meaningfully improve the outcome.`,
  },
  {
    id: 'minimal',
    label: 'Minimal & Fast',
    color: 'emerald',
    description: 'Best for lightweight tasks — short answers, no explanation padding.',
    snippet: `Be concise. Output only what is necessary — no preamble, no explanation unless asked.
Prefer shorter code and fewer files. Avoid over-engineering.
If something is obvious, skip the explanation.`,
  },
]

const TONE_COLORS = {
  blue:   { tag: 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300', btn: 'hover:bg-blue-50 dark:hover:bg-blue-950 hover:border-blue-300 dark:hover:border-blue-700' },
  red:    { tag: 'bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300', btn: 'hover:bg-red-50 dark:hover:bg-red-950 hover:border-red-300 dark:hover:border-red-700' },
  violet: { tag: 'bg-violet-100 dark:bg-violet-900 text-violet-700 dark:text-violet-300', btn: 'hover:bg-violet-50 dark:hover:bg-violet-950 hover:border-violet-300 dark:hover:border-violet-700' },
  emerald:{ tag: 'bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-300', btn: 'hover:bg-emerald-50 dark:hover:bg-emerald-950 hover:border-emerald-300 dark:hover:border-emerald-700' },
}

// Manual fallback for pairs whose names don't match by substring
const KNOWN_PAIRS = {
  'reviewer':         'code-review',
  'coder-backend':    'code-write',
  'coder-frontend':   'code-write',
  'investigator':     'investigate',
  'prompt-enhancer':  'prompt-enhance',
}

// Try to pair agent with skill by name similarity
function matchSkill(agentFilename, skills) {
  // 1. Exact match
  const exact = skills.find(s => s.dirname === agentFilename)
  if (exact) return exact
  // 2. Skill dirname is substring of agent filename (debugger→debug, researcher→research)
  const sub = skills.find(s => agentFilename.includes(s.dirname))
  if (sub) return sub
  // 3. Agent filename is substring of skill dirname
  const rev = skills.find(s => s.dirname.includes(agentFilename))
  if (rev) return rev
  // 4. Manual fallback for known pairs with unrelated names
  const known = KNOWN_PAIRS[agentFilename]
  return known ? (skills.find(s => s.dirname === known) || null) : null
}

const EMPTY_AGENT = { filename: '', name: '', description: '', model: 'sonnet', body: '' }
const EMPTY_SKILL = { dirname: '', name: '', description: '', userInvocable: true, body: '' }

export default function Agents() {
  const [agents, setAgents] = useState([])
  const [skills, setSkills] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null) // { mode, tab, agent?, skill?, newAgent?, newSkill? }
  const [agentForm, setAgentForm] = useState(EMPTY_AGENT)
  const [skillForm, setSkillForm] = useState(EMPTY_SKILL)
  const [activeTab, setActiveTab] = useState('agent') // 'agent' | 'skill'
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)

  async function load() {
    setLoading(true)
    try {
      const [a, s] = await Promise.all([api.getAgents(), api.getSkills()])
      setAgents(a)
      setSkills(s)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  // Build paired + unpaired lists
  const usedSkillDirnames = new Set()
  const pairs = agents.map(agent => {
    const skill = matchSkill(agent.filename, skills)
    if (skill) usedSkillDirnames.add(skill.dirname)
    return { agent, skill }
  })
  const standaloneSkills = skills.filter(s => !usedSkillDirnames.has(s.dirname))

  function openNew() {
    setAgentForm(EMPTY_AGENT)
    setSkillForm(EMPTY_SKILL)
    setSaveError(null)
    setActiveTab('agent')
    setModal({ mode: 'new' })
  }

  function openEdit(agent, skill) {
    setAgentForm({
      filename: agent.filename,
      name: agent.name || '',
      description: agent.description || '',
      model: agent.model || 'sonnet',
      body: agent.body || '',
    })
    setSkillForm(skill ? {
      dirname: skill.dirname,
      name: skill.name || '',
      description: skill.description || '',
      userInvocable: skill['user-invocable'] !== false,
      body: skill.body || '',
    } : { ...EMPTY_SKILL, dirname: agent.filename, name: agent.name || '' })
    setSaveError(null)
    setActiveTab('agent')
    setModal({ mode: 'edit', agent, skill })
  }

  function openEditSkill(skill) {
    setSkillForm({
      dirname: skill.dirname,
      name: skill.name || '',
      description: skill.description || '',
      userInvocable: skill['user-invocable'] !== false,
      body: skill.body || '',
    })
    setAgentForm(EMPTY_AGENT)
    setSaveError(null)
    setActiveTab('skill')
    setModal({ mode: 'edit-skill', skill })
  }

  async function handleSave() {
    setSaving(true)
    setSaveError(null)
    try {
      if (modal.mode === 'new') {
        // Save agent if filled
        if (agentForm.filename.trim()) {
          await api.createAgent({
            filename: agentForm.filename.trim(),
            name: agentForm.name.trim(),
            description: agentForm.description.trim(),
            model: agentForm.model,
            body: agentForm.body,
          })
        }
        // Save skill if filled
        if (skillForm.dirname.trim()) {
          await api.createSkill({
            dirname: skillForm.dirname.trim(),
            name: skillForm.name.trim(),
            description: skillForm.description.trim(),
            userInvocable: skillForm.userInvocable,
            body: skillForm.body,
          })
        }
      } else if (modal.mode === 'edit') {
        // Update agent
        await api.updateAgent(modal.agent.filename, {
          name: agentForm.name.trim(),
          description: agentForm.description.trim(),
          model: agentForm.model,
          body: agentForm.body,
        })
        // Create or update skill
        if (skillForm.dirname.trim()) {
          if (modal.skill) {
            await api.updateSkill(modal.skill.dirname, {
              name: skillForm.name.trim(),
              description: skillForm.description.trim(),
              userInvocable: skillForm.userInvocable,
              body: skillForm.body,
            })
          } else {
            await api.createSkill({
              dirname: skillForm.dirname.trim(),
              name: skillForm.name.trim(),
              description: skillForm.description.trim(),
              userInvocable: skillForm.userInvocable,
              body: skillForm.body,
            })
          }
        }
      } else if (modal.mode === 'edit-skill') {
        await api.updateSkill(modal.skill.dirname, {
          name: skillForm.name.trim(),
          description: skillForm.description.trim(),
          userInvocable: skillForm.userInvocable,
          body: skillForm.body,
        })
      }
      setModal(null)
      load()
    } catch (e) {
      setSaveError(e.message)
    } finally {
      setSaving(false)
    }
  }

  async function deleteAgent(filename) {
    if (!confirm(`Delete agent "${filename}"?`)) return
    await api.deleteAgent(filename)
    load()
  }

  async function deleteSkill(dirname) {
    if (!confirm(`Delete skill "${dirname}"?`)) return
    await api.deleteSkill(dirname)
    load()
  }

  const modalTitle = modal?.mode === 'new' ? 'New Agent & Skill'
    : modal?.mode === 'edit' ? `Edit: ${modal.agent.name || modal.agent.filename}`
    : modal?.mode === 'edit-skill' ? `Edit skill: ${modal.skill.name || modal.skill.dirname}`
    : ''

  const showSkillTab = modal?.mode !== 'edit-skill'

  return (
    <div className="p-8 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Agents & Skills</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            {agents.length} agents · {skills.length} skills
          </p>
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Agent
        </button>
      </div>

      {loading ? (
        <div className="text-gray-400 dark:text-gray-500 text-sm py-8">Loading...</div>
      ) : (
        <div className="space-y-2">
          {/* Paired agent+skill rows */}
          {pairs.map(({ agent, skill }) => (
            <PairRow
              key={agent.filename}
              agent={agent}
              skill={skill}
              onEdit={() => openEdit(agent, skill)}
              onDeleteAgent={() => deleteAgent(agent.filename)}
              onDeleteSkill={skill ? () => deleteSkill(skill.dirname) : null}
            />
          ))}

          {/* Standalone skills (no matching agent) */}
          {standaloneSkills.length > 0 && (
            <>
              <div className="pt-4 pb-1">
                <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Standalone Skills</p>
              </div>
              {standaloneSkills.map(skill => (
                <SkillOnlyRow
                  key={skill.dirname}
                  skill={skill}
                  onEdit={() => openEditSkill(skill)}
                  onDelete={() => deleteSkill(skill.dirname)}
                />
              ))}
            </>
          )}
        </div>
      )}

      {/* Unified modal */}
      {modal && (
        <Modal
          title={modalTitle}
          onClose={() => setModal(null)}
          wide
          footer={
            <>
              <button onClick={() => setModal(null)} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors">
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
            </>
          }
        >
          {saveError && (
            <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2 text-red-700 dark:text-red-400 text-sm mb-4">{saveError}</div>
          )}

          {/* Tabs */}
          {showSkillTab && (
            <div className="flex border-b border-gray-200 dark:border-gray-700 mb-5 -mt-1">
              <TabBtn active={activeTab === 'agent'} onClick={() => setActiveTab('agent')}
                icon="🤖" label="Agent" />
              <TabBtn active={activeTab === 'skill'} onClick={() => setActiveTab('skill')}
                icon="⚡" label={modal.skill ? 'Skill' : 'Skill (optional)'} />
            </div>
          )}

          {/* Agent form */}
          {activeTab === 'agent' && (
            <div className="space-y-4">
              {modal.mode === 'new' && (
                <Field label="Filename" hint=".claude/agents/{filename}.md">
                  <input value={agentForm.filename}
                    onChange={e => setAgentForm(f => ({ ...f, filename: e.target.value.replace(/[^a-z0-9-]/g, '-') }))}
                    placeholder="my-agent" className={inputCls} autoFocus />
                </Field>
              )}
              <div className="grid grid-cols-2 gap-3">
                <Field label="Display Name">
                  <input value={agentForm.name}
                    onChange={e => setAgentForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="My Agent" className={inputCls} />
                </Field>
                <Field label="Model">
                  <select value={agentForm.model}
                    onChange={e => setAgentForm(f => ({ ...f, model: e.target.value }))}
                    className={inputCls}>
                    {MODEL_OPTIONS.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </Field>
              </div>
              <Field label="Description">
                <input value={agentForm.description}
                  onChange={e => setAgentForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="What this agent does" className={inputCls} />
              </Field>
              <Field label="Agent Definition (Markdown)">
                <textarea rows={12} value={agentForm.body}
                  onChange={e => setAgentForm(f => ({ ...f, body: e.target.value }))}
                  placeholder="# Agent Name&#10;&#10;**Soul:** ...&#10;&#10;## Core Responsibilities&#10;..."
                  className={`${inputCls} font-mono text-xs resize-y`} />
              </Field>
              <PromptTips onInsert={snippet => setAgentForm(f => ({ ...f, body: f.body ? f.body + '\n\n' + snippet : snippet }))} />
            </div>
          )}

          {/* Skill form */}
          {activeTab === 'skill' && (
            <div className="space-y-4">
              {(modal.mode === 'new' || (modal.mode === 'edit' && !modal.skill)) && (
                <Field label="Directory Name" hint=".claude/skills/{dirname}/SKILL.md">
                  <input value={skillForm.dirname}
                    onChange={e => setSkillForm(f => ({ ...f, dirname: e.target.value.replace(/[^a-z0-9-]/g, '-') }))}
                    placeholder="my-skill" className={inputCls} />
                </Field>
              )}
              <div className="grid grid-cols-2 gap-3">
                <Field label="Display Name">
                  <input value={skillForm.name}
                    onChange={e => setSkillForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="My Skill" className={inputCls} />
                </Field>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1.5">User-invocable</label>
                  <label className="flex items-center gap-2 h-[38px] cursor-pointer">
                    <input type="checkbox" checked={skillForm.userInvocable}
                      onChange={e => setSkillForm(f => ({ ...f, userInvocable: e.target.checked }))}
                      className="w-4 h-4 text-indigo-600 rounded" />
                    <span className="text-sm text-gray-600 dark:text-gray-300">Can be called by users</span>
                  </label>
                </div>
              </div>
              <Field label="Description">
                <input value={skillForm.description}
                  onChange={e => setSkillForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="When and how to use this skill" className={inputCls} />
              </Field>
              <Field label="Skill Instructions (Markdown)">
                <textarea rows={12} value={skillForm.body}
                  onChange={e => setSkillForm(f => ({ ...f, body: e.target.value }))}
                  placeholder="# Skill Name&#10;&#10;## Purpose&#10;...&#10;&#10;## Steps&#10;..."
                  className={`${inputCls} font-mono text-xs resize-y`} />
              </Field>
            </div>
          )}
        </Modal>
      )}
    </div>
  )
}

// ─── sub-components ──────────────────────────────────────────────────────────

function PairRow({ agent, skill, onEdit, onDeleteAgent, onDeleteSkill }) {
  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden hover:border-gray-300 dark:hover:border-gray-600 transition-colors">
      <div className="flex items-stretch">
        {/* Agent side */}
        <div className="flex-1 flex items-start gap-3 px-4 py-3 border-r border-gray-100 dark:border-gray-800">
          <div className="w-8 h-8 bg-indigo-100 dark:bg-indigo-900 rounded-lg flex items-center justify-center shrink-0 mt-0.5">
            <svg className="w-4 h-4 text-indigo-600 dark:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17H4a2 2 0 01-2-2V5a2 2 0 012-2h16a2 2 0 012 2v10a2 2 0 01-2 2h-1" />
            </svg>
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-gray-900 dark:text-white">{agent.name || agent.filename}</span>
              {agent.model && (
                <span className="text-xs text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950 px-1.5 py-0.5 rounded font-mono">{agent.model}</span>
              )}
            </div>
            {agent.description && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-1">{agent.description}</p>
            )}
          </div>
        </div>

        {/* Skill side */}
        <div className="flex-1 flex items-start gap-3 px-4 py-3">
          {skill ? (
            <>
              <div className="w-8 h-8 bg-yellow-100 dark:bg-yellow-900 rounded-lg flex items-center justify-center shrink-0 mt-0.5">
                <svg className="w-4 h-4 text-yellow-600 dark:text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-gray-900 dark:text-white">{skill.name || skill.dirname}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                    skill['user-invocable'] !== false ? 'text-green-700 dark:text-green-400 bg-green-100 dark:bg-green-900' : 'text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800'
                  }`}>
                    {skill['user-invocable'] !== false ? 'user' : 'internal'}
                  </span>
                </div>
                {skill.description && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-1">{skill.description}</p>
                )}
              </div>
            </>
          ) : (
            <div className="flex items-center gap-2 text-gray-300 dark:text-gray-600">
              <div className="w-8 h-8 bg-gray-50 dark:bg-gray-800 rounded-lg flex items-center justify-center shrink-0">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <span className="text-xs text-gray-400 dark:text-gray-500 italic">No skill linked</span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 px-3 border-l border-gray-100 dark:border-gray-800">
          <button onClick={onEdit}
            className="p-1.5 text-gray-400 dark:text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950 rounded-lg transition-colors"
            title="Edit agent & skill">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
          <button onClick={onDeleteAgent}
            className="p-1.5 text-gray-400 dark:text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950 rounded-lg transition-colors"
            title="Delete agent">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}

function SkillOnlyRow({ skill, onEdit, onDelete }) {
  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden hover:border-gray-300 dark:hover:border-gray-600 transition-colors">
      <div className="flex items-stretch">
        <div className="flex-1 flex items-start gap-3 px-4 py-3">
          <div className="w-8 h-8 bg-yellow-100 dark:bg-yellow-900 rounded-lg flex items-center justify-center shrink-0 mt-0.5">
            <svg className="w-4 h-4 text-yellow-600 dark:text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-gray-900 dark:text-white">{skill.name || skill.dirname}</span>
              <span className="text-xs text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded font-mono">{skill.dirname}</span>
              <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                skill['user-invocable'] !== false ? 'text-green-700 dark:text-green-400 bg-green-100 dark:bg-green-900' : 'text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800'
              }`}>
                {skill['user-invocable'] !== false ? 'user' : 'internal'}
              </span>
            </div>
            {skill.description && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-1">{skill.description}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 px-3 border-l border-gray-100 dark:border-gray-800">
          <button onClick={onEdit}
            className="p-1.5 text-gray-400 dark:text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950 rounded-lg transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
          <button onClick={onDelete}
            className="p-1.5 text-gray-400 dark:text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950 rounded-lg transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}

function TabBtn({ active, onClick, icon, label }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
        active
          ? 'border-indigo-600 text-indigo-600'
          : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:border-gray-300 dark:hover:border-gray-600'
      }`}
    >
      <span>{icon}</span>
      {label}
    </button>
  )
}

function Field({ label, hint, children }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1.5">
        {label}
        {hint && <span className="text-xs text-gray-400 dark:text-gray-500 font-normal ml-1.5">— {hint}</span>}
      </label>
      {children}
    </div>
  )
}

function PromptTips({ onInsert }) {
  const [open, setOpen] = useState(false)
  const [inserted, setInserted] = useState(null)

  function handleInsert(preset) {
    onInsert(preset.snippet)
    setInserted(preset.id)
    setTimeout(() => setInserted(null), 1500)
  }

  return (
    <div className="border border-amber-200 dark:border-amber-800 rounded-lg overflow-hidden">
      {/* Header toggle */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2.5 px-3 py-2.5 bg-amber-50 dark:bg-amber-950 hover:bg-amber-100 dark:hover:bg-amber-900 transition-colors text-left"
      >
        <span className="text-base leading-none">💡</span>
        <div className="flex-1 min-w-0">
          <span className="text-xs font-semibold text-amber-800 dark:text-amber-300">Prompt Tone Tips</span>
          <span className="text-xs text-amber-600 dark:text-amber-400 ml-2">
            — LLMs don't have a "temperature" knob here. Use language instead.
          </span>
        </div>
        <svg className={`w-3.5 h-3.5 text-amber-500 transition-transform shrink-0 ${open ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="px-3 pt-3 pb-4 bg-amber-50/50 dark:bg-amber-950/50 space-y-3">
          <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed">
            Claude doesn't expose a temperature slider in agent definitions. Instead, the <strong>wording of your instructions</strong> controls how creative, strict, or concise the agent behaves.
            Pick a preset below to append a tone block to your definition, or write your own.
          </p>

          <div className="grid grid-cols-2 gap-2">
            {TONE_PRESETS.map(preset => {
              const c = TONE_COLORS[preset.color]
              const done = inserted === preset.id
              return (
                <button
                  key={preset.id}
                  onClick={() => handleInsert(preset)}
                  className={`text-left border border-gray-200 dark:border-gray-700 rounded-lg p-2.5 transition-colors bg-white dark:bg-gray-900 ${c.btn}`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${c.tag}`}>{preset.label}</span>
                    {done && <span className="text-xs text-green-600 dark:text-green-400 font-medium">✓ Added</span>}
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{preset.description}</p>
                </button>
              )
            })}
          </div>

          <div className="border-t border-amber-200 dark:border-amber-800 pt-3">
            <p className="text-xs text-amber-600 dark:text-amber-500 font-medium mb-1">Write your own tone instructions:</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-gray-500 dark:text-gray-400">
              <span>→ "Be deterministic. No extras."</span>
              <span>→ "Consider multiple approaches."</span>
              <span>→ "Output only what's necessary."</span>
              <span>→ "Be strict. List every issue."</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
