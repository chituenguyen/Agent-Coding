import { useMemo, useState, useEffect } from "react";
import StatusBadge from "./StatusBadge";

function ChevronIcon({ expanded }) {
  return (
    <svg
      className={`w-3.5 h-3.5 text-gray-400 transition-transform shrink-0 ${expanded ? "rotate-90" : ""}`}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 5l7 7-7 7"
      />
    </svg>
  );
}

function CountBadge({ count, tone = "gray" }) {
  const toneCls =
    tone === "red"
      ? "bg-red-100 dark:bg-red-900 text-red-600 dark:text-red-400"
      : "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400";
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded-full ${toneCls} shrink-0`}>
      {count}
    </span>
  );
}

function nodeKey(node) {
  if (!node) return null;
  if (node.type === "company") return `company:${node.id}`;
  if (node.type === "repo") return `company:${node.parentId}`;
  return null;
}

export default function McpTree({ data, selectedNode, onSelect }) {
  const globalChildCount =
    (data?.global?.servers?.length || 0) +
    (data?.global?.connectors?.length || 0);

  const defaultExpanded = useMemo(() => {
    const s = new Set();
    if (globalChildCount <= 5 && globalChildCount > 0) s.add("global");
    return s;
  }, [globalChildCount]);

  const [expanded, setExpanded] = useState(defaultExpanded);

  useEffect(() => {
    setExpanded((prev) => {
      const next = new Set(prev);
      const k = nodeKey(selectedNode);
      if (k) next.add(k);
      return next;
    });
  }, [selectedNode]);

  function toggle(id) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const isSelected = (type, id, parentId) => {
    if (!selectedNode) return false;
    if (selectedNode.type !== type) return false;
    if (selectedNode.id !== id) return false;
    if (parentId && selectedNode.parentId !== parentId) return false;
    return true;
  };

  return (
    <nav className="text-sm select-none">
      <button
        onClick={() => onSelect({ type: "dashboard" })}
        className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left transition-colors ${
          selectedNode?.type === "dashboard"
            ? "bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300"
            : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
        }`}
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
            strokeWidth={1.5}
            d="M3 12l9-9 9 9M5 10v10a1 1 0 001 1h3v-6h6v6h3a1 1 0 001-1V10"
          />
        </svg>
        Dashboard
      </button>

      <div className="mt-3">
        <div
          className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md cursor-pointer ${
            isSelected("global", undefined)
              ? "bg-indigo-50 dark:bg-indigo-950"
              : "hover:bg-gray-100 dark:hover:bg-gray-800"
          }`}
        >
          <button
            onClick={() => toggle("global")}
            className="flex items-center"
            aria-label="Toggle global"
          >
            <ChevronIcon expanded={expanded.has("global")} />
          </button>
          <button
            onClick={() => onSelect({ type: "global" })}
            className="flex items-center gap-2 flex-1 min-w-0 text-left"
          >
            <span className="font-medium text-gray-800 dark:text-gray-200">
              Global
            </span>
            <CountBadge count={globalChildCount} />
          </button>
        </div>
        {expanded.has("global") && (
          <ul className="ml-5 mt-0.5 space-y-0.5">
            {(data?.global?.servers || []).map((s) => (
              <li key={`g-${s.name}`}>
                <button
                  onClick={() =>
                    onSelect({ type: "global-server", id: s.name })
                  }
                  className={`w-full flex items-center gap-2 px-2 py-1 rounded text-left text-xs ${
                    isSelected("global-server", s.name)
                      ? "bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300"
                      : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                  }`}
                >
                  <StatusBadge status={s.status} />
                  <span className="truncate">{s.name}</span>
                </button>
              </li>
            ))}
            {(data?.global?.connectors || []).map((c) => (
              <li key={`c-${c.name}`}>
                <button
                  onClick={() =>
                    onSelect({ type: "global-server", id: c.name })
                  }
                  className={`w-full flex items-center gap-2 px-2 py-1 rounded text-left text-xs ${
                    isSelected("global-server", c.name)
                      ? "bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300"
                      : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                  }`}
                >
                  <StatusBadge status="connector" />
                  <span className="truncate">{c.name}</span>
                </button>
              </li>
            ))}
            {globalChildCount === 0 && (
              <li className="px-2 py-1 text-xs text-gray-400 italic">(none)</li>
            )}
          </ul>
        )}
      </div>

      <div className="mt-2">
        <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
          Companies
        </div>
        {(data?.companies || []).map((co) => {
          const key = `company:${co.id}`;
          const isOpen = expanded.has(key);
          const total = co.repos.reduce(
            (s, r) => s + (r.mcpServerCount || 0),
            0,
          );
          return (
            <div key={co.id}>
              <div
                className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md cursor-pointer ${
                  isSelected("company", co.id)
                    ? "bg-indigo-50 dark:bg-indigo-950"
                    : "hover:bg-gray-100 dark:hover:bg-gray-800"
                }`}
              >
                <button
                  onClick={() => toggle(key)}
                  aria-label={`Toggle ${co.name}`}
                >
                  <ChevronIcon expanded={isOpen} />
                </button>
                <button
                  onClick={() => onSelect({ type: "company", id: co.id })}
                  className="flex items-center gap-2 flex-1 min-w-0 text-left"
                >
                  <span
                    className="inline-block w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: co.accent || "#6366f1" }}
                  />
                  <span className="font-medium text-gray-800 dark:text-gray-200 truncate">
                    {co.name}
                  </span>
                  <CountBadge count={total} />
                </button>
              </div>
              {isOpen && (
                <ul className="ml-5 mt-0.5 space-y-0.5">
                  {co.repos.map((r) => (
                    <li key={`r-${co.id}-${r.name}`}>
                      <button
                        onClick={() =>
                          onSelect({
                            type: "repo",
                            id: r.name,
                            parentId: co.id,
                          })
                        }
                        className={`w-full flex items-center gap-2 px-2 py-1 rounded text-left text-xs ${
                          isSelected("repo", r.name, co.id)
                            ? "bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300"
                            : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                        }`}
                      >
                        <svg
                          className="w-3.5 h-3.5 shrink-0"
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
                        <span className="truncate flex-1">{r.name}</span>
                        <CountBadge count={r.mcpServerCount || 0} />
                      </button>
                    </li>
                  ))}
                  {co.repos.length === 0 && (
                    <li className="px-2 py-1 text-xs text-gray-400 italic">
                      (no repos)
                    </li>
                  )}
                </ul>
              )}
            </div>
          );
        })}
        {(!data?.companies || data.companies.length === 0) && (
          <div className="px-2 py-1 text-xs text-gray-400 italic">
            (no companies)
          </div>
        )}
      </div>

      <div className="mt-3">
        <div
          className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md cursor-pointer ${
            selectedNode?.type === "unaffiliated" && !selectedNode.id
              ? "bg-indigo-50 dark:bg-indigo-950"
              : "hover:bg-gray-100 dark:hover:bg-gray-800"
          }`}
        >
          <button
            onClick={() => toggle("unaffiliated")}
            aria-label="Toggle unaffiliated"
          >
            <ChevronIcon expanded={expanded.has("unaffiliated")} />
          </button>
          <button
            onClick={() => onSelect({ type: "unaffiliated" })}
            className="flex items-center gap-2 flex-1 min-w-0 text-left"
          >
            <span className="font-medium text-gray-800 dark:text-gray-200">
              Unaffiliated
            </span>
            <CountBadge count={(data?.unaffiliated || []).length} />
          </button>
        </div>
        {expanded.has("unaffiliated") && (
          <ul className="ml-5 mt-0.5 space-y-0.5">
            {(data?.unaffiliated || []).map((r) => (
              <li key={`u-${r.name}`}>
                <button
                  onClick={() => onSelect({ type: "unaffiliated", id: r.name })}
                  className={`w-full flex items-center gap-2 px-2 py-1 rounded text-left text-xs ${
                    isSelected("unaffiliated", r.name)
                      ? "bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300"
                      : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                  }`}
                >
                  <svg
                    className="w-3.5 h-3.5 shrink-0"
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
                  <span className="truncate flex-1">{r.name}</span>
                  <CountBadge count={r.mcpServerCount || 0} />
                </button>
              </li>
            ))}
            {(data?.unaffiliated || []).length === 0 && (
              <li className="px-2 py-1 text-xs text-gray-400 italic">(none)</li>
            )}
          </ul>
        )}
      </div>
    </nav>
  );
}
