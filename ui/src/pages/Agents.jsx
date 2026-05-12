import { useState, useEffect } from 'react'
import { api } from '../api'
import Modal from '../components/Modal'
import { toast } from "sonner";
import { dialog } from "../components/Dialog";

const MODEL_OPTIONS = ['sonnet', 'haiku', 'opus', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001', 'claude-opus-4-6']
const inputCls = 'w-full rounded-co-sm border border-co-fg/15 bg-co-bg text-co-fg px-3 py-2 text-sm outline-none focus:border-co-fg/40 transition-colors'

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
    if (!(await dialog.confirm({ message: `Delete agent "${filename}"?`, tone: "danger", confirmLabel: "Delete" }))) return
    await api.deleteAgent(filename)
    load()
  }

  async function deleteSkill(dirname) {
    if (!(await dialog.confirm({ message: `Delete skill "${dirname}"?`, tone: "danger", confirmLabel: "Delete" }))) return
    await api.deleteSkill(dirname)
    load()
  }

  const modalTitle = modal?.mode === 'new' ? 'New Agent & Skill'
    : modal?.mode === 'edit' ? `Edit: ${modal.agent.name || modal.agent.filename}`
    : modal?.mode === 'edit-skill' ? `Edit skill: ${modal.skill.name || modal.skill.dirname}`
    : ''

  const showSkillTab = modal?.mode !== 'edit-skill'

  return (
    <div className="cofounder-skin relative min-h-full bg-co-bg">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 h-[420px] w-[420px] -translate-x-1/2 rounded-full opacity-[0.06] blur-3xl"
        style={{
          background:
            'radial-gradient(circle, rgb(var(--co-accent-rgb)) 0%, transparent 70%)',
        }}
      />
      <div className="relative mx-auto max-w-4xl px-8 py-10">
      {/* Header */}
      <header className="mb-8 flex items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-co-fg/40">
            <span className="h-px w-6 bg-co-fg/20" />
            Configure
          </div>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-co-fg">Agents &amp; Skills</h1>
          <div className="mt-1.5 flex items-center gap-3 text-xs text-co-fg/55">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
              {agents.length} agent{agents.length === 1 ? '' : 's'}
            </span>
            <span className="text-co-fg/25">·</span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
              {skills.length} skill{skills.length === 1 ? '' : 's'}
            </span>
          </div>
        </div>
        <button
          onClick={openNew}
          className="group inline-flex shrink-0 items-center gap-2 rounded-co-sm bg-co-primary px-4 py-2 text-xs font-semibold text-co-primary-fg shadow-[0_4px_14px_-6px_rgba(0,0,0,0.25)] transition-all hover:opacity-90 hover:shadow-[0_6px_20px_-8px_rgba(0,0,0,0.4)]"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="transition-transform group-hover:rotate-90">
            <path d="M12 5v14M5 12h14" />
          </svg>
          New Agent
        </button>
      </header>

      {loading ? (
        <div className="py-8 text-sm text-co-fg/45">Loading…</div>
      ) : (
        <div className="space-y-2.5">
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
              <div className="mb-1 mt-6 flex items-center gap-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-co-fg/45">
                  Standalone Skills
                </p>
                <span className="rounded-full bg-co-fg/[0.06] px-1.5 py-0.5 text-[10px] font-medium text-co-fg/55">
                  {standaloneSkills.length}
                </span>
                <span className="h-px flex-1 bg-co-fg/[0.08]" />
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
      </div>

      {/* Unified modal */}
      {modal && (
        <Modal
          title={modalTitle}
          onClose={() => setModal(null)}
          wide
          footer={
            <>
              <button
                onClick={() => setModal(null)}
                className="rounded-co-sm px-4 py-2 text-sm font-medium text-co-fg/60 transition-colors hover:bg-co-fg/[0.05] hover:text-co-fg"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="rounded-co-sm bg-co-primary px-4 py-2 text-sm font-semibold text-co-primary-fg transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </>
          }
        >
          {saveError && (
            <div className="mb-4 rounded-co-sm border border-co-destructive/30 bg-co-destructive/[0.06] px-3 py-2 text-sm text-co-destructive">{saveError}</div>
          )}

          {/* Tabs */}
          {showSkillTab && (
            <div className="-mt-1 mb-5 flex border-b border-co-fg/10">
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

const AGENT_ICON = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="6" width="18" height="12" rx="2" />
    <circle cx="9" cy="12" r="1" fill="currentColor" />
    <circle cx="15" cy="12" r="1" fill="currentColor" />
    <path d="M8 6V4M16 6V4M12 18v2" opacity="0.6" />
  </svg>
)

const SKILL_ICON = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
  </svg>
)

const EDIT_ICON = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
  </svg>
)

const TRASH_ICON = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    <path d="M10 11v6M14 11v6" />
    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
  </svg>
)

function PairRow({ agent, skill, onEdit, onDeleteAgent, onDeleteSkill }) {
  return (
    <div className="group relative overflow-hidden rounded-co-lg border border-co-fg/10 bg-co-surface transition-all hover:-translate-y-0.5 hover:border-co-fg/20 hover:shadow-[0_8px_24px_-16px_rgba(0,0,0,0.2)]">
      {/* Subtle accent stripe on hover */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px opacity-0 transition-opacity group-hover:opacity-50"
        style={{
          background:
            'linear-gradient(90deg, transparent, rgb(var(--co-accent-rgb)), transparent)',
        }}
      />
      <div className="flex items-stretch">
        {/* Agent side */}
        <div className="flex flex-1 items-start gap-3 border-r border-co-fg/[0.06] px-4 py-3.5">
          <div
            className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-co"
            style={{
              background: 'linear-gradient(135deg, #6366f126, #6366f10d)',
              boxShadow: 'inset 0 0 0 1px #6366f133',
              color: '#6366f1',
            }}
          >
            {AGENT_ICON}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-semibold tracking-tight text-co-fg">
                {agent.name || agent.filename}
              </span>
              {agent.model && (
                <span
                  className="rounded-co-sm px-1.5 py-0.5 font-mono text-[10px] font-medium"
                  style={{
                    background: '#6366f114',
                    color: '#6366f1',
                  }}
                >
                  {agent.model}
                </span>
              )}
            </div>
            {agent.description && (
              <p className="mt-0.5 line-clamp-1 text-xs text-co-fg/55">{agent.description}</p>
            )}
          </div>
        </div>

        {/* Skill side */}
        <div className="flex flex-1 items-start gap-3 px-4 py-3.5">
          {skill ? (
            <>
              <div
                className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-co"
                style={{
                  background: 'linear-gradient(135deg, #f59e0b26, #f59e0b0d)',
                  boxShadow: 'inset 0 0 0 1px #f59e0b33',
                  color: '#d97706',
                }}
              >
                {SKILL_ICON}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-semibold tracking-tight text-co-fg">
                    {skill.name || skill.dirname}
                  </span>
                  <span
                    className={`rounded-co-sm px-1.5 py-0.5 text-[10px] font-medium ${
                      skill['user-invocable'] !== false
                        ? 'bg-co-success/15 text-co-success'
                        : 'bg-co-fg/[0.06] text-co-fg/55'
                    }`}
                  >
                    {skill['user-invocable'] !== false ? 'user' : 'internal'}
                  </span>
                </div>
                {skill.description && (
                  <p className="mt-0.5 line-clamp-1 text-xs text-co-fg/55">{skill.description}</p>
                )}
              </div>
            </>
          ) : (
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-co border border-dashed border-co-fg/15 text-co-fg/30">
                {SKILL_ICON}
              </div>
              <span className="text-xs italic text-co-fg/40">No skill linked</span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 border-l border-co-fg/[0.06] px-2">
          <button
            onClick={onEdit}
            className="flex h-8 w-8 items-center justify-center rounded-co-sm text-co-fg/45 transition-colors hover:bg-co-fg/[0.06] hover:text-co-fg"
            title="Edit agent & skill"
          >
            {EDIT_ICON}
          </button>
          <button
            onClick={onDeleteAgent}
            className="flex h-8 w-8 items-center justify-center rounded-co-sm text-co-fg/45 transition-colors hover:bg-co-destructive/10 hover:text-co-destructive"
            title="Delete agent"
          >
            {TRASH_ICON}
          </button>
        </div>
      </div>
    </div>
  )
}

function SkillOnlyRow({ skill, onEdit, onDelete }) {
  return (
    <div className="group relative overflow-hidden rounded-co-lg border border-co-fg/10 bg-co-surface transition-all hover:-translate-y-0.5 hover:border-co-fg/20 hover:shadow-[0_8px_24px_-16px_rgba(0,0,0,0.2)]">
      <div className="flex items-stretch">
        <div className="flex flex-1 items-start gap-3 px-4 py-3.5">
          <div
            className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-co"
            style={{
              background: 'linear-gradient(135deg, #f59e0b26, #f59e0b0d)',
              boxShadow: 'inset 0 0 0 1px #f59e0b33',
              color: '#d97706',
            }}
          >
            {SKILL_ICON}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="truncate text-sm font-semibold tracking-tight text-co-fg">
                {skill.name || skill.dirname}
              </span>
              <span className="rounded-co-sm bg-co-fg/[0.06] px-1.5 py-0.5 font-mono text-[10px] text-co-fg/55">
                {skill.dirname}
              </span>
              <span
                className={`rounded-co-sm px-1.5 py-0.5 text-[10px] font-medium ${
                  skill['user-invocable'] !== false
                    ? 'bg-co-success/15 text-co-success'
                    : 'bg-co-fg/[0.06] text-co-fg/55'
                }`}
              >
                {skill['user-invocable'] !== false ? 'user' : 'internal'}
              </span>
            </div>
            {skill.description && (
              <p className="mt-0.5 line-clamp-1 text-xs text-co-fg/55">{skill.description}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 border-l border-co-fg/[0.06] px-2">
          <button
            onClick={onEdit}
            className="flex h-8 w-8 items-center justify-center rounded-co-sm text-co-fg/45 transition-colors hover:bg-co-fg/[0.06] hover:text-co-fg"
            title="Edit skill"
          >
            {EDIT_ICON}
          </button>
          <button
            onClick={onDelete}
            className="flex h-8 w-8 items-center justify-center rounded-co-sm text-co-fg/45 transition-colors hover:bg-co-destructive/10 hover:text-co-destructive"
            title="Delete skill"
          >
            {TRASH_ICON}
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
      className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
        active
          ? 'border-co-fg text-co-fg'
          : 'border-transparent text-co-fg/50 hover:border-co-fg/20 hover:text-co-fg/80'
      }`}
    >
      <span className={active ? 'text-co-fg' : 'text-co-fg/45'}>
        {icon === '🤖' ? AGENT_ICON : icon === '⚡' ? SKILL_ICON : icon}
      </span>
      {label}
    </button>
  )
}

function Field({ label, hint, children }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-co-fg/80">
        {label}
        {hint && (
          <span className="ml-1.5 font-normal text-xs text-co-fg/45">— {hint}</span>
        )}
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
