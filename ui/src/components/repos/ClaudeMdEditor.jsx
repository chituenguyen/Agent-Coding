import { useEffect, useState } from "react";
import { toast } from "sonner";
import Modal from "../Modal";
import ClaudeMdConflictModal from "./ClaudeMdConflictModal";
import { useClaudeMd } from "../../hooks/useClaudeMd";

export default function ClaudeMdEditor({ name, onClose, onSaved }) {
  const {
    content,
    mtime,
    path,
    exists,
    loading,
    saving,
    error,
    conflict,
    save,
    resolveConflict,
  } = useClaudeMd(name);

  const [draft, setDraft] = useState("");
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (!loading && !initialized) {
      setDraft(content || "");
      setInitialized(true);
    }
  }, [loading, content, initialized]);

  // When the hook reloads after a conflict resolution, sync the draft.
  useEffect(() => {
    if (!conflict && initialized) {
      setDraft(content || "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, mtime]);

  async function handleSave() {
    const result = await save(draft);
    if (result.ok) {
      toast.success(exists ? "CLAUDE.md saved" : "CLAUDE.md created");
      onSaved && onSaved();
      onClose && onClose();
    } else if (!result.conflict && result.error) {
      toast.error(result.error.message || "Save failed");
    }
  }

  if (conflict) {
    return (
      <ClaudeMdConflictModal
        localContent={conflict.localContent}
        remoteContent={conflict.remoteContent}
        remoteMtime={conflict.remoteMtime}
        saving={saving}
        onReload={async () => {
          await resolveConflict("reload");
        }}
        onOverwrite={async () => {
          const result = await resolveConflict("overwrite");
          if (result.ok) {
            toast.success("CLAUDE.md overwritten");
            onSaved && onSaved();
            onClose && onClose();
          } else if (result.error) {
            toast.error(result.error.message || "Overwrite failed");
          }
        }}
        onCancel={() => resolveConflict("cancel")}
      />
    );
  }

  return (
    <Modal
      title={`${exists ? "Edit" : "Create"} CLAUDE.md — ${name}`}
      onClose={onClose}
      wide
      footer={
        <>
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || loading}
            className="px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-md"
          >
            {saving ? "Saving…" : exists ? "Save" : "Create"}
          </button>
        </>
      }
    >
      {loading ? (
        <p className="text-sm text-gray-400 dark:text-gray-500">Loading…</p>
      ) : error ? (
        <p className="text-sm text-red-500">{error.message || String(error)}</p>
      ) : (
        <>
          <div className="flex items-center justify-between mb-2 text-[11px] text-gray-400 dark:text-gray-500">
            <span className="font-mono truncate">{path}</span>
            {exists && mtime && (
              <span className="ml-2 shrink-0">
                mtime: {new Date(mtime).toLocaleString()}
              </span>
            )}
            {!exists && <span className="ml-2 shrink-0">new file</span>}
          </div>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            spellCheck={false}
            className="w-full h-[55vh] font-mono text-xs whitespace-pre bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 text-gray-700 dark:text-gray-200 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
            placeholder={
              exists
                ? ""
                : "# Repo CLAUDE.md\n\nWrite project-level guidance here…"
            }
          />
        </>
      )}
    </Modal>
  );
}
