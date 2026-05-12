import { useState, useEffect } from 'react'
import { api } from '../api'
import Modal from '../components/Modal'
import { toast } from "sonner";
import { dialog } from "../components/Dialog";

const EMPTY_FORM = { dirname: '', name: '', description: '', userInvocable: true, body: '' }

const inputCls = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none'

export default function Skills() {
  const [skills, setSkills] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)
  const [deleting, setDeleting] = useState(null)

  async function load() {
    setLoading(true)
    try { setSkills(await api.getSkills()) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  function openCreate() {
    setForm(EMPTY_FORM)
    setSaveError(null)
    setModal({ mode: 'create' })
  }

  function openEdit(skill) {
    setForm({
      dirname: skill.dirname || '',
      name: skill.name || '',
      description: skill.description || '',
      userInvocable: skill['user-invocable'] !== false,
      body: skill.body || '',
    })
    setSaveError(null)
    setModal({ mode: 'edit', skill })
  }

  async function handleSave() {
    if (modal.mode === 'create' && !form.dirname.trim()) {
      setSaveError('Directory name is required')
      return
    }
    setSaving(true)
    setSaveError(null)
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim(),
        userInvocable: form.userInvocable,
        body: form.body,
      }
      if (modal.mode === 'create') {
        await api.createSkill({ ...payload, dirname: form.dirname.trim() })
      } else {
        await api.updateSkill(modal.skill.dirname, payload)
      }
      setModal(null)
      load()
    } catch (e) {
      setSaveError(e.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(dirname) {
    if (!(await dialog.confirm({ message: `Delete skill "${dirname}"? This will remove the entire directory.`, tone: "danger", confirmLabel: "Delete" }))) return
    setDeleting(dirname)
    try { await api.deleteSkill(dirname); load() }
    catch (e) { toast.error(e.message) }
    finally { setDeleting(null) }
  }

  return (
    <div className="p-8 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Skills</h1>
          <p className="text-sm text-gray-500 mt-0.5">Reusable capabilities invoked by the Skill tool</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Skill
        </button>
      </div>

      {loading ? (
        <div className="text-gray-400 text-sm">Loading skills...</div>
      ) : skills.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="font-medium text-gray-600">No skills defined</p>
          <p className="text-sm mt-1">Skills are reusable instruction sets the Skill tool can invoke</p>
          <button onClick={openCreate} className="mt-4 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors">
            Add first skill
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {skills.map((skill) => (
            <div key={skill.dirname} className="bg-white border border-gray-200 rounded-lg p-4 flex items-start gap-4 hover:border-gray-300 transition-colors">
              <div className="w-9 h-9 bg-yellow-100 rounded-lg flex items-center justify-center shrink-0 mt-0.5">
                <svg className="w-4 h-4 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-sm font-semibold text-gray-900">{skill.name || skill.dirname}</h3>
                  <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded font-mono">{skill.dirname}/SKILL.md</span>
                  <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                    skill['user-invocable'] !== false
                      ? 'text-green-700 bg-green-100'
                      : 'text-gray-500 bg-gray-100'
                  }`}>
                    {skill['user-invocable'] !== false ? 'User-invocable' : 'Internal only'}
                  </span>
                </div>
                {skill.description && (
                  <p className="text-sm text-gray-500 mt-1 line-clamp-2">{skill.description}</p>
                )}
              </div>
              <div className="flex gap-1 shrink-0">
                <button
                  onClick={() => openEdit(skill)}
                  className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                  title="Edit"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
                <button
                  onClick={() => handleDelete(skill.dirname)}
                  disabled={deleting === skill.dirname}
                  className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                  title="Delete"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <Modal
          title={modal.mode === 'create' ? 'New Skill' : `Edit: ${modal.skill.name || modal.skill.dirname}`}
          onClose={() => setModal(null)}
          wide
          footer={
            <>
              <button onClick={() => setModal(null)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 transition-colors">
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors"
              >
                {saving ? 'Saving...' : 'Save Skill'}
              </button>
            </>
          }
        >
          <div className="space-y-4">
            {saveError && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-red-700 text-sm">{saveError}</div>
            )}

            {modal.mode === 'create' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Directory Name
                  <span className="text-xs text-gray-400 font-normal ml-1.5">— .claude/skills/{'{dirname}'}/SKILL.md</span>
                </label>
                <input
                  value={form.dirname}
                  onChange={e => setForm(f => ({ ...f, dirname: e.target.value.replace(/[^a-z0-9-]/g, '-') }))}
                  placeholder="my-skill"
                  className={inputCls}
                  autoFocus
                />
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Display Name</label>
                <input
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="My Skill"
                  className={inputCls}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">User-invocable</label>
                <div className="flex items-center h-[38px]">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.userInvocable}
                      onChange={e => setForm(f => ({ ...f, userInvocable: e.target.checked }))}
                      className="w-4 h-4 text-indigo-600 rounded"
                    />
                    <span className="text-sm text-gray-600">Can be called by users</span>
                  </label>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Description</label>
              <input
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="What this skill does and when to use it"
                className={inputCls}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Skill Instructions (Markdown)</label>
              <textarea
                rows={12}
                value={form.body}
                onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
                placeholder="# Skill Name&#10;&#10;## Purpose&#10;...&#10;&#10;## Instructions&#10;..."
                className={`${inputCls} font-mono text-xs resize-y`}
              />
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
