import { useState } from "react";
import { toast } from "sonner";
import { useRepoHealth } from "../../hooks/useRepoHealth";
import { api } from "../../api";
import RepoBadges from "./RepoBadges";
import PerProjectMcpState from "./PerProjectMcpState";

function relativeAgo(iso) {
  if (!iso) return "never";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  const diff = Math.max(0, Date.now() - t);
  const s = Math.round(diff / 1000);
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}

function Section({ title, children, count }) {
  return (
    <section className="border-t border-gray-200 dark:border-gray-700 pt-4 mt-4">
      <h3 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">
        {title}
        {count != null && (
          <span className="ml-1.5 font-normal opacity-70">({count})</span>
        )}
      </h3>
      {children}
    </section>
  );
}

function NameList({ names }) {
  if (!names || names.length === 0) {
    return (
      <p className="text-xs text-gray-400 dark:text-gray-500 italic">(none)</p>
    );
  }
  return (
    <ul className="grid grid-cols-2 gap-x-3 gap-y-1">
      {names.map((n) => (
        <li
          key={n}
          className="text-xs font-mono text-gray-700 dark:text-gray-300 truncate"
        >
          {n}
        </li>
      ))}
    </ul>
  );
}

export default function RepoHealthDetailPane({
  name,
  onClose,
  onEditClaudeMd,
}) {
  const { data, loading, error, refetch } = useRepoHealth(name);
  const [repairing, setRepairing] = useState(false);

  if (loading && !data) {
    return (
      <div className="p-2">
        <div className="h-6 w-1/2 bg-gray-100 dark:bg-gray-800 rounded animate-pulse mb-3" />
        <div className="h-4 w-2/3 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="p-2">
        <p className="text-sm text-red-500">
          Failed to load: {String(error.message || error)}
        </p>
        <button
          onClick={refetch}
          className="mt-2 text-xs px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!data) return null;

  const missing = data.exists === false;

  return (
    <div>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white truncate">
              {data.name}
            </h2>
            {data.company && (
              <span
                className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded font-medium"
                style={{
                  background: "rgba(99,102,241,0.12)",
                  color: "#6366f1",
                }}
              >
                {data.company.name}
              </span>
            )}
          </div>
          <p className="text-[11px] text-gray-400 dark:text-gray-500 font-mono truncate mt-0.5">
            {data.repoPath}
          </p>
          <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">
            Last scanned {relativeAgo(data.lastScannedAt)} ·{" "}
            <button
              onClick={refetch}
              className="underline hover:text-indigo-500"
            >
              Refresh
            </button>
          </p>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            title="Close"
            className="flex h-7 w-7 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-600"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {missing && (
        <div className="mb-3 px-3 py-2 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-900 rounded-lg text-xs text-amber-700 dark:text-amber-300">
          Repository path does not exist on disk. Update{" "}
          <code className="font-mono">mcp_server.json</code> or{" "}
          <code className="font-mono">companies.json</code>.
        </div>
      )}

      <div className="mb-3">
        <RepoBadges health={data} />
      </div>

      <div className="flex items-center gap-2 mb-2">
        <button
          onClick={() => onEditClaudeMd && onEditClaudeMd(name)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium rounded-lg transition-colors"
        >
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
          </svg>
          {data.claudeMd?.exists ? "Edit CLAUDE.md" : "Create CLAUDE.md"}
        </button>
        {data.links?.status !== "linked" && (
          <button
            onClick={async () => {
              setRepairing(true);
              try {
                await api.repairRepoLinks(name);
                toast.success("Workspace links repaired");
                refetch();
              } catch (e) {
                toast.error(`Repair links failed: ${e.message || e}`);
              } finally {
                setRepairing(false);
              }
            }}
            disabled={repairing}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-xs font-medium rounded-lg transition-colors"
          >
            {repairing ? "Repairing..." : "Repair links"}
          </button>
        )}
      </div>

      <Section title="Per-project MCP state">
        <PerProjectMcpState health={data} />
      </Section>

      <Section title="Agents" count={data.agents?.count ?? 0}>
        <NameList names={data.agents?.names} />
      </Section>

      <Section title="Skills" count={data.skills?.count ?? 0}>
        <NameList names={data.skills?.names} />
      </Section>
    </div>
  );
}
