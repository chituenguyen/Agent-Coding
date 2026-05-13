import { useEffect, useState } from "react";
import { api } from "../api";

export default function RemotePathModal({
  prompt,
  initial = "",
  onCancel,
  onConfirm,
}) {
  const [value, setValue] = useState(initial);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [recents, setRecents] = useState([]);

  useEffect(() => {
    // Load recent paths on mount
    api
      .getRecentPaths()
      .then((res) => {
        setRecents(res.paths || []);
      })
      .catch(() => {
        // Silently fail — show empty recents
        setRecents([]);
      });
  }, []);

  async function confirmFlow(path) {
    if (!path.trim()) {
      setError("path required");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await api.validatePath(path);
      if (res.ok) {
        onConfirm(res.path);
      } else {
        setError(res.error || "Invalid path");
        setBusy(false);
      }
    } catch (err) {
      setError(err.message || "Validation failed");
      setBusy(false);
    }
  }

  function handleChipClick(path) {
    // Tap a chip: immediately validate and confirm
    confirmFlow(path);
  }

  function handleBackdropClick(e) {
    if (e.target === e.currentTarget) {
      onCancel();
    }
  }

  function handleKeyDown(e) {
    if (e.key === "Escape") {
      onCancel();
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm outline-none"
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
      role="presentation"
      tabIndex={-1}
    >
      <div className="relative w-full max-w-lg overflow-hidden rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            {prompt}
          </h2>
          <button
            onClick={onCancel}
            className="flex h-11 w-11 items-center justify-center text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
            type="button"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="px-6 py-4 space-y-4">
          {/* Recent paths chips */}
          {recents.length > 0 && (
            <div>
              <div className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
                Recent paths
              </div>
              <div className="flex flex-nowrap gap-2 overflow-x-auto pb-2">
                {recents.map((item) => (
                  <button
                    key={item.path}
                    onClick={() => handleChipClick(item.path)}
                    disabled={busy}
                    className="min-h-[44px] px-4 py-2 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 text-sm font-medium whitespace-nowrap hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                    type="button"
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Text input */}
          <div>
            <label className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1 block">
              Path
            </label>
            <input
              type="text"
              inputMode="text"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck="false"
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                setError(null);
              }}
              placeholder="/Users/you/path/to/folder or ~/Desktop/repo"
              className="w-full px-4 py-3 text-base font-mono border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg outline-none focus:border-blue-500 dark:focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20 dark:focus:ring-blue-400/20 transition-colors"
            />
          </div>

          {/* Error message */}
          {error && (
            <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/40 rounded-lg px-3 py-2">
              {error}
            </div>
          )}
        </div>

        {/* Footer buttons */}
        <div className="flex items-center gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50">
          <button
            onClick={onCancel}
            disabled={busy}
            className="flex-1 min-h-[44px] px-4 py-2 text-sm font-medium border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            type="button"
          >
            Cancel
          </button>
          <button
            onClick={() => confirmFlow(value)}
            disabled={busy}
            className="flex-1 min-h-[44px] px-4 py-2 text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-600 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            type="button"
          >
            {busy && (
              <svg
                className="w-4 h-4 animate-spin"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8v8z"
                />
              </svg>
            )}
            Use this path
          </button>
        </div>
      </div>
    </div>
  );
}
