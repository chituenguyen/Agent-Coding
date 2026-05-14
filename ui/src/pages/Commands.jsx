import { useState, useEffect } from "react";
import { api } from "../api";
import Modal from "../components/Modal";
import { toast } from "sonner";
import { dialog } from "../components/Dialog";

const EMPTY_FORM = { filename: "", content: "" };

const inputCls =
  "w-full border border-gray-300 dark:border-gray-600 bg-white text-gray-900 dark:bg-gray-800 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none";

export default function Commands() {
  const [commands, setCommands] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [deleting, setDeleting] = useState(null);

  async function load() {
    setLoading(true);
    try {
      setCommands(await api.getCommands());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function openCreate() {
    setForm(EMPTY_FORM);
    setSaveError(null);
    setModal({ mode: "create" });
  }

  function openEdit(cmd) {
    setForm({ filename: cmd.filename, content: cmd.content || "" });
    setSaveError(null);
    setModal({ mode: "edit", cmd });
  }

  async function handleSave() {
    if (!form.filename.trim()) {
      setSaveError("Filename is required");
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      if (modal.mode === "create") {
        await api.createCommand({
          filename: form.filename.trim(),
          content: form.content,
        });
      } else {
        await api.updateCommand(modal.cmd.filename, { content: form.content });
      }
      setModal(null);
      load();
    } catch (e) {
      setSaveError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(filename) {
    if (
      !(await dialog.confirm({
        message: `Delete command "${filename}"?`,
        tone: "danger",
        confirmLabel: "Delete",
      }))
    )
      return;
    setDeleting(filename);
    try {
      await api.deleteCommand(filename);
      load();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setDeleting(null);
    }
  }

  function getPreview(content) {
    const line = content?.split("\n").find((l) => l.trim());
    return line?.replace(/^#+\s*/, "").trim() || "(empty)";
  }

  return (
    <div className="p-8 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Commands
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Slash commands invoked with /command-name in Claude
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 4v16m8-8H4"
            />
          </svg>
          New Command
        </button>
      </div>

      {loading ? (
        <div className="text-gray-400 dark:text-gray-500 text-sm">
          Loading commands...
        </div>
      ) : commands.length === 0 ? (
        <div className="text-center py-16 text-gray-400 dark:text-gray-500">
          <p className="font-medium text-gray-600 dark:text-gray-300">
            No commands defined
          </p>
          <p className="text-sm mt-1">
            Commands are slash-invocable instructions for Claude
          </p>
          <button
            onClick={openCreate}
            className="mt-4 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Add first command
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {commands.map((cmd) => (
            <div
              key={cmd.filename}
              className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-4 flex items-start gap-4 hover:border-gray-300 dark:hover:border-gray-600 transition-colors"
            >
              <div className="w-9 h-9 bg-slate-100 dark:bg-slate-800 rounded-lg flex items-center justify-center shrink-0 mt-0.5">
                <svg
                  className="w-4 h-4 text-slate-600 dark:text-slate-300"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white font-mono">
                    /{cmd.filename}
                  </h3>
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 truncate">
                  {getPreview(cmd.content)}
                </p>
              </div>
              <div className="flex gap-1 shrink-0">
                <button
                  onClick={() => openEdit(cmd)}
                  className="p-1.5 text-gray-400 dark:text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950 rounded-lg transition-colors"
                  title="Edit"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                    />
                  </svg>
                </button>
                <button
                  onClick={() => handleDelete(cmd.filename)}
                  disabled={deleting === cmd.filename}
                  className="p-1.5 text-gray-400 dark:text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950 rounded-lg transition-colors disabled:opacity-50"
                  title="Delete"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <Modal
          title={
            modal.mode === "create"
              ? "New Command"
              : `Edit: /${modal.cmd.filename}`
          }
          onClose={() => setModal(null)}
          wide
          footer={
            <>
              <button
                onClick={() => setModal(null)}
                className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors"
              >
                {saving ? "Saving..." : "Save Command"}
              </button>
            </>
          }
        >
          <div className="space-y-4">
            {saveError && (
              <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2 text-red-700 dark:text-red-400 text-sm">
                {saveError}
              </div>
            )}

            {modal.mode === "create" && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1.5">
                  Command Name
                  <span className="text-xs text-gray-400 dark:text-gray-500 font-normal ml-1.5">
                    — invoked as /{"{name}"} in Claude
                  </span>
                </label>
                <div className="flex items-center border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-indigo-500">
                  <span className="px-3 py-2 bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 text-sm border-r border-gray-300 dark:border-gray-600 font-mono">
                    /
                  </span>
                  <input
                    value={form.filename}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        filename: e.target.value.replace(/[^a-z0-9-]/g, "-"),
                      }))
                    }
                    placeholder="my-command"
                    className="flex-1 px-3 py-2 text-sm outline-none font-mono bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                    autoFocus
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1.5">
                Command Instructions (Markdown)
                <span className="text-xs text-gray-400 dark:text-gray-500 font-normal ml-1.5">
                  — defines what Claude does when this command is invoked
                </span>
              </label>
              <textarea
                rows={16}
                value={form.content}
                onChange={(e) =>
                  setForm((f) => ({ ...f, content: e.target.value }))
                }
                placeholder={`# /${form.filename || "my-command"} Command\n\n## Purpose\n\n...\n\n## When to Use\n\n...\n\n## Implementation\n\n...`}
                className={`${inputCls} font-mono text-xs resize-y`}
              />
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
