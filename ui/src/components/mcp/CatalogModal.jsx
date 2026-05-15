import { useState, useEffect } from "react";
import Modal from "../Modal";
import { toast } from "sonner";
import { api } from "../../api";

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

function CatalogItemGrid({ items, existingNames, onAdd }) {
  const groups = items.reduce((acc, item) => {
    const cat = item.category || "Other";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {});
  return (
    <div className="space-y-6">
      {Object.entries(groups).map(([category, groupItems]) => (
        <div key={category}>
          <h3 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">
            {category}
          </h3>
          <div className="grid grid-cols-2 gap-3">
            {groupItems.map((item) => {
              const installed = existingNames.includes(item.name);
              return (
                <div
                  key={item.name}
                  className={`bg-white dark:bg-gray-900 border rounded-xl p-4 flex items-start gap-3 ${installed ? "border-green-200 dark:border-green-800 bg-green-50/30 dark:bg-green-950/30" : "border-gray-200 dark:border-gray-700 hover:border-indigo-300"} transition-colors`}
                >
                  <span className="text-2xl shrink-0">{item.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-gray-900 dark:text-white">
                        {item.label}
                      </span>
                      {installed && (
                        <span className="text-xs text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900 px-1.5 py-0.5 rounded-full">
                          Added
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">
                      {item.description}
                    </p>
                    <button
                      onClick={() => onAdd(item)}
                      className={`mt-2.5 text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${installed ? "text-gray-500 border border-gray-200 dark:border-gray-700 hover:border-indigo-300 hover:text-indigo-600" : "bg-indigo-600 hover:bg-indigo-700 text-white"}`}
                    >
                      {installed ? "Re-configure" : "Add"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

const EMPTY_NEW_ITEM = {
  name: "",
  label: "",
  icon: "🔌",
  category: "",
  description: "",
  command: "",
  args: "",
  env: [{ k: "", v: "" }],
};

export default function CatalogModal({
  open,
  onClose,
  catalog,
  existingNames = [],
  targetRepo,
  onAdd,
}) {
  const [view, setView] = useState("browse");
  const [form, setForm] = useState(EMPTY_NEW_ITEM);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      setView("browse");
      setForm(EMPTY_NEW_ITEM);
    }
  }, [open]);

  if (!open) return null;

  async function handleSaveNew() {
    if (!form.name.trim() || !form.command.trim()) return;
    setSaving(true);
    try {
      const args = form.args.trim() ? form.args.trim().split(/\s+/) : [];
      const env = Object.fromEntries(
        form.env.filter((e) => e.k).map((e) => [e.k, e.v]),
      );
      const item = {
        name: form.name.trim(),
        label: form.label.trim() || form.name.trim(),
        icon: form.icon || "🔌",
        category: form.category.trim() || "Other",
        description: form.description.trim(),
        config: {
          type: "stdio",
          command: form.command.trim(),
          ...(args.length ? { args } : {}),
          ...(Object.keys(env).length ? { env } : {}),
        },
      };
      await api.upsertCatalog(item);
      setView("browse");
      setForm(EMPTY_NEW_ITEM);
    } catch (err) {
      toast.error("Failed to save: " + err.message);
    } finally {
      setSaving(false);
    }
  }

  const title =
    view === "new"
      ? "Add to Catalog"
      : targetRepo
        ? `Adding to: ${targetRepo.name}`
        : "Catalog";

  return (
    <Modal
      title={title}
      onClose={onClose}
      wide
      footer={
        view === "new" ? (
          <>
            <button
              onClick={() => setView("browse")}
              className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors"
            >
              Back
            </button>
            <button
              onClick={handleSaveNew}
              disabled={saving || !form.name.trim() || !form.command.trim()}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? "Saving..." : "Add to Catalog"}
            </button>
          </>
        ) : (
          <>
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors"
            >
              Close
            </button>
            <button
              onClick={() => setView("new")}
              className="px-4 py-2 border border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950 text-sm font-medium rounded-lg transition-colors"
            >
              + New entry
            </button>
          </>
        )
      }
    >
      {view === "browse" ? (
        <div className="max-h-[60vh] overflow-y-auto">
          {targetRepo && (
            <div className="mb-4 flex items-center gap-2 px-3 py-2 bg-indigo-50 dark:bg-indigo-950 border border-indigo-200 dark:border-indigo-800 rounded-lg">
              <p className="text-sm text-indigo-700 dark:text-indigo-300 flex-1">
                Path:{" "}
                <code className="font-mono text-xs">{targetRepo.repoPath}</code>
              </p>
            </div>
          )}
          <CatalogItemGrid
            items={catalog || []}
            existingNames={existingNames}
            onAdd={(item) => onAdd && onAdd(item, targetRepo)}
          />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex gap-3">
            <div className="w-20">
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">
                Icon
              </label>
              <input
                value={form.icon}
                onChange={(e) =>
                  setForm((f) => ({ ...f, icon: e.target.value }))
                }
                placeholder="🔌"
                className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg px-3 py-2 text-sm text-center focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">
                Name{" "}
                <span className="font-normal text-gray-400">(unique ID)</span>
              </label>
              <input
                value={form.name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, name: e.target.value }))
                }
                placeholder="my-server"
                className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">
                Label{" "}
                <span className="font-normal text-gray-400">(display)</span>
              </label>
              <input
                value={form.label}
                onChange={(e) =>
                  setForm((f) => ({ ...f, label: e.target.value }))
                }
                placeholder="My Server"
                className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">
              Category
            </label>
            <input
              value={form.category}
              onChange={(e) =>
                setForm((f) => ({ ...f, category: e.target.value }))
              }
              placeholder="Storage, Web, Services..."
              className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">
              Description
            </label>
            <input
              value={form.description}
              onChange={(e) =>
                setForm((f) => ({ ...f, description: e.target.value }))
              }
              placeholder="What this MCP server does"
              className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">
              Command
            </label>
            <input
              value={form.command}
              onChange={(e) =>
                setForm((f) => ({ ...f, command: e.target.value }))
              }
              placeholder="npx or /path/to/uvx"
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
              onChange={(e) => setForm((f) => ({ ...f, args: e.target.value }))}
              placeholder="-y @modelcontextprotocol/server-name"
              className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-2">
              Environment Variables{" "}
              <span className="font-normal text-gray-400">(optional)</span>
            </label>
            <KVEditor
              rows={form.env}
              onChange={(env) => setForm((f) => ({ ...f, env }))}
              keyPlaceholder="API_KEY"
              valPlaceholder="value"
            />
          </div>
        </div>
      )}
    </Modal>
  );
}
