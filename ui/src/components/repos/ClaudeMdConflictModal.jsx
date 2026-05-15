import Modal from "../Modal";

export default function ClaudeMdConflictModal({
  localContent,
  remoteContent,
  remoteMtime,
  saving,
  onReload,
  onOverwrite,
  onCancel,
}) {
  return (
    <Modal
      title="CLAUDE.md was edited outside the workspace"
      onClose={onCancel}
      wide
      footer={
        <>
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md"
          >
            Cancel
          </button>
          <button
            onClick={onOverwrite}
            disabled={saving}
            className="px-3 py-1.5 text-xs font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded-md"
          >
            {saving ? "Saving…" : "Overwrite"}
          </button>
          <button
            onClick={onReload}
            disabled={saving}
            className="px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-md"
          >
            Reload
          </button>
        </>
      }
    >
      <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">
        The file has been changed since you opened it. Your local edits are on
        the left; the current file on disk is on the right. Reload to discard
        your edits, or overwrite to save yours anyway.
      </p>
      {remoteMtime && (
        <p className="text-[11px] text-gray-400 dark:text-gray-500 font-mono mb-3">
          Remote mtime: {new Date(remoteMtime).toLocaleString()}
        </p>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1.5">
            Your edits (local)
          </h4>
          <pre className="text-xs font-mono whitespace-pre-wrap break-words bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 max-h-[50vh] overflow-y-auto text-gray-700 dark:text-gray-200">
            {localContent || "(empty)"}
          </pre>
        </div>
        <div>
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1.5">
            On disk (remote)
          </h4>
          <pre className="text-xs font-mono whitespace-pre-wrap break-words bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 max-h-[50vh] overflow-y-auto text-gray-700 dark:text-gray-200">
            {remoteContent || "(empty)"}
          </pre>
        </div>
      </div>
    </Modal>
  );
}
