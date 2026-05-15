export default function RepoHealthLayout({
  search,
  onSearch,
  onRefresh,
  refreshing,
  left,
  right,
}) {
  return (
    <div className="max-w-[1400px] mx-auto px-4 py-6">
      <div className="flex items-center justify-between gap-4 mb-6">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Repo Health
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            A window into per-repo Claude state — CLAUDE.md, settings, agents,
            skills, MCP
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <input
            value={search || ""}
            onChange={(e) => onSearch && onSearch(e.target.value)}
            placeholder="Search…"
            className="w-56 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
          />
          <button
            onClick={onRefresh}
            disabled={refreshing}
            className="flex items-center gap-2 px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            <svg
              className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            Refresh
          </button>
        </div>
      </div>
      <div
        className={
          right
            ? "grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-6 min-h-[calc(100vh-180px)]"
            : "min-h-[calc(100vh-180px)]"
        }
      >
        <main className="min-w-0">{left}</main>
        {right && (
          <aside className="border-l border-gray-200 dark:border-gray-700 lg:pl-6 min-w-0">
            {right}
          </aside>
        )}
      </div>
    </div>
  );
}
