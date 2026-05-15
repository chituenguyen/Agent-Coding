import { useRepoHealth } from "../../hooks/useRepoHealth";
import RepoBadges from "./RepoBadges";

export default function RepoHealthCard({
  name,
  repoPath,
  company,
  selected,
  onOpen,
}) {
  const { data, loading, error } = useRepoHealth(name);

  const missing = data && data.exists === false;

  return (
    <button
      type="button"
      onClick={() => onOpen && onOpen(name)}
      className={`text-left w-full bg-white dark:bg-gray-900 border rounded-xl p-4 transition-colors hover:border-indigo-300 dark:hover:border-indigo-700 ${
        selected
          ? "border-indigo-400 dark:border-indigo-600 ring-2 ring-indigo-200 dark:ring-indigo-900"
          : "border-gray-200 dark:border-gray-700"
      }`}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <svg
          className="w-4 h-4 text-indigo-500 shrink-0"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"
          />
        </svg>
        <span className="text-sm font-semibold text-gray-900 dark:text-white truncate flex-1">
          {name}
        </span>
        {company && (
          <span
            className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded font-medium"
            style={{
              background: company.accent
                ? `${company.accent}22`
                : "rgba(99,102,241,0.12)",
              color: company.accent || "#6366f1",
            }}
            title={company.name}
          >
            {company.name}
          </span>
        )}
      </div>
      <p className="text-[11px] text-gray-400 dark:text-gray-500 font-mono truncate mb-3">
        {repoPath}
      </p>

      {loading && (
        <div className="space-y-2">
          <div className="h-5 w-3/4 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
          <div className="h-5 w-1/2 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
        </div>
      )}
      {error && !loading && (
        <p className="text-xs text-red-500">Failed to load health</p>
      )}
      {data && !loading && (
        <>
          {missing && (
            <div className="mb-2 px-2 py-1.5 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-900 rounded text-xs text-amber-700 dark:text-amber-300">
              Path missing on disk — uninitialized
            </div>
          )}
          <RepoBadges health={data} />
        </>
      )}
    </button>
  );
}
