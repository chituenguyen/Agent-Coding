import Modal from "../Modal";
import { MODAL_MODE, TRANSPORT } from "./mcpForm";

function KVEditor({
  rows,
  onChange,
  keyPlaceholder = "key",
  valPlaceholder = "value",
}) {
  function update(i, field, val) {
    onChange(rows.map((r, j) => (j === i ? { ...r, [field]: val } : r)));
  }
  return (
    <div className="space-y-1.5">
      {rows.map((row, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <input
            value={row.k}
            onChange={(e) => update(i, "k", e.target.value)}
            placeholder={keyPlaceholder}
            className="w-2/5 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg px-2.5 py-1.5 text-xs font-mono focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
          />
          <input
            value={row.v}
            onChange={(e) => update(i, "v", e.target.value)}
            placeholder={valPlaceholder}
            className="flex-1 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg px-2.5 py-1.5 text-xs font-mono focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
          />
          <button
            onClick={() =>
              onChange(
                rows.length > 1
                  ? rows.filter((_, j) => j !== i)
                  : [{ k: "", v: "" }],
              )
            }
            className="p-1 text-gray-300 dark:text-gray-600 hover:text-red-400 transition-colors"
          >
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
      ))}
      <button
        onClick={() => onChange([...rows, { k: "", v: "" }])}
        className="text-xs text-indigo-500 hover:text-indigo-700 transition-colors"
      >
        + Add row
      </button>
    </div>
  );
}

export default function McpModal({
  modal,
  saving,
  onChange,
  onSave,
  onClose,
  isRepo,
}) {
  const { mode, form, project } = modal;
  const isEdit = mode === MODAL_MODE.EDIT;
  return (
    <Modal
      title={
        isEdit
          ? `Edit "${form.name}"`
          : isRepo
            ? `Add MCP to ${project}`
            : "Add MCP Server"
      }
      onClose={onClose}
      footer={
        <>
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onSave}
            disabled={saving || !form.name.trim()}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? "Saving..." : isEdit ? "Save Changes" : "Add Server"}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">
              Server Name
            </label>
            <input
              value={form.name}
              onChange={(e) => onChange({ name: e.target.value })}
              disabled={isEdit}
              placeholder="my-server"
              className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none disabled:bg-gray-50 dark:disabled:bg-gray-800 disabled:text-gray-400"
            />
          </div>
          {!isRepo && (
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">
                Scope
              </label>
              <select
                value={form.scope}
                onChange={(e) => onChange({ scope: e.target.value })}
                disabled={isEdit}
                className="border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none disabled:bg-gray-50 dark:disabled:bg-gray-800 bg-white"
              >
                <option value="project">Project</option>
                <option value="global">Global</option>
              </select>
            </div>
          )}
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-2">
            Type
          </label>
          <div className="flex gap-2">
            {[TRANSPORT.STDIO, TRANSPORT.HTTP].map((t) => (
              <button
                key={t}
                onClick={() => onChange({ type: t })}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium border transition-colors ${form.type === t ? "bg-indigo-600 text-white border-indigo-600" : "border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-indigo-300"}`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
        {form.type === TRANSPORT.STDIO ? (
          <>
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">
                Command
              </label>
              <input
                value={form.command}
                onChange={(e) => onChange({ command: e.target.value })}
                placeholder="npx"
                className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">
                Args{" "}
                <span className="font-normal text-gray-400">
                  (space-separated)
                </span>
              </label>
              <input
                value={form.args}
                onChange={(e) => onChange({ args: e.target.value })}
                placeholder="-y @modelcontextprotocol/server-filesystem /"
                className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-2">
                Environment Variables
              </label>
              <KVEditor
                rows={form.env}
                onChange={(env) => onChange({ env })}
                keyPlaceholder="VAR_NAME"
                valPlaceholder="value"
              />
            </div>
          </>
        ) : (
          <>
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">
                URL
              </label>
              <input
                value={form.url}
                onChange={(e) => onChange({ url: e.target.value })}
                placeholder="https://mcp.example.com/mcp"
                className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-2">
                Headers
              </label>
              <KVEditor
                rows={form.headers}
                onChange={(headers) => onChange({ headers })}
                keyPlaceholder="Authorization"
                valPlaceholder="Bearer token..."
              />
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
