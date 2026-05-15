import { useState } from "react";
import StatusBadge from "./StatusBadge";

const STATUS_SUB = {
  disabled: "Disabled in this project — toggle via /mcp in Claude CLI.",
  broken: "Health check failed — see details below.",
  connector: "OAuth · read-only — managed in claude.ai",
};

export default function McpServerCard({
  server,
  status,
  scope,
  variant,
  readOnly,
  onEdit,
  onDelete,
}) {
  const [expanded, setExpanded] = useState(false);
  const isConnector = variant === "connector" || status === "connector";
  const ro = readOnly || isConnector;
  const cfg = server.config || {};
  const isHttp = cfg.type === "http";
  const transport = isConnector ? undefined : isHttp ? "http" : "stdio";
  const sub = STATUS_SUB[status];

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3">
        <StatusBadge status={status} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-900 dark:text-white">
              {server.name}
            </span>
            {transport && (
              <span className="text-xs px-1.5 py-0.5 rounded font-mono bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
                {transport}
              </span>
            )}
            {isConnector && (
              <span className="text-xs px-1.5 py-0.5 rounded font-mono bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400">
                oauth · read-only
              </span>
            )}
          </div>
          {sub && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              {sub}
            </p>
          )}
          {!isConnector && (
            <p className="text-xs text-gray-400 dark:text-gray-500 font-mono truncate mt-0.5">
              {isHttp
                ? cfg.url
                : `${cfg.command || ""}${
                    cfg.args?.length ? " " + cfg.args.join(" ") : ""
                  }`}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {!isConnector && (
            <button
              onClick={() => setExpanded((o) => !o)}
              className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              title="Details"
            >
              <svg
                className={`w-4 h-4 transition-transform ${expanded ? "rotate-180" : ""}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>
          )}
          {isConnector ? (
            <a
              href="https://claude.ai/settings/connectors"
              target="_blank"
              rel="noopener noreferrer"
              className="px-2.5 py-1 text-xs font-medium text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800 rounded-md hover:bg-blue-50 dark:hover:bg-blue-950 transition-colors"
            >
              Open settings ↗
            </a>
          ) : ro ? null : (
            <>
              <button
                onClick={() => onEdit && onEdit(server, scope)}
                className="p-1.5 text-gray-400 hover:text-indigo-600 rounded-md hover:bg-indigo-50 dark:hover:bg-indigo-950 transition-colors"
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
                onClick={() => onDelete && onDelete(server, scope)}
                className="p-1.5 text-gray-400 hover:text-red-500 rounded-md hover:bg-red-50 dark:hover:bg-red-950 transition-colors"
                title="Remove"
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
            </>
          )}
        </div>
      </div>
      {expanded && !isConnector && (
        <div className="px-4 pb-3 pt-0 border-t border-gray-100 dark:border-gray-800">
          <pre className="text-xs font-mono text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-800 rounded-lg p-3 overflow-x-auto">
            {JSON.stringify(cfg, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
