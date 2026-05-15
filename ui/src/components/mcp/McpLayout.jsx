export default function McpLayout({
  search,
  onSearch,
  onAddCatalog,
  left,
  children,
}) {
  return (
    <div className="max-w-[1400px] mx-auto px-4 py-6">
      <div className="flex items-center justify-between gap-4 mb-6">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            MCP Servers
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Browse global, company, and per-repo Model Context Protocol servers
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
            onClick={onAddCatalog}
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
            Add from Catalog
          </button>
        </div>
      </div>
      <div className="grid grid-cols-[320px_1fr] gap-6 min-h-[calc(100vh-180px)]">
        <aside className="border-r border-gray-200 dark:border-gray-700 pr-4 overflow-y-auto">
          {left}
        </aside>
        <main className="min-w-0">{children}</main>
      </div>
    </div>
  );
}
