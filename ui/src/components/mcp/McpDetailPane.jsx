import { Link } from "react-router-dom";
import McpServerCard from "./McpServerCard";
import StatusBadge from "./StatusBadge";

function PaneHeader({ title, subtitle, accent, right }) {
  return (
    <div className="flex items-start justify-between gap-4 mb-5 pb-4 border-b border-gray-200 dark:border-gray-700">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {accent && (
            <span
              className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: accent }}
            />
          )}
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white truncate">
            {title}
          </h2>
        </div>
        {subtitle && (
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 font-mono truncate">
            {subtitle}
          </p>
        )}
      </div>
      {right}
    </div>
  );
}

function EmptyState({ children }) {
  return (
    <div className="text-sm text-gray-400 dark:text-gray-500 py-8 text-center">
      {children}
    </div>
  );
}

function Dashboard({ data }) {
  const globalCount =
    (data?.global?.servers?.length || 0) +
    (data?.global?.connectors?.length || 0);
  const repoServerCount =
    (data?.companies || []).reduce(
      (acc, co) => acc + co.repos.reduce((s, r) => s + r.servers.length, 0),
      0,
    ) + (data?.unaffiliated || []).reduce((s, r) => s + r.servers.length, 0);
  const total = globalCount + repoServerCount;
  const allRepos = [
    ...(data?.companies || []).flatMap((c) => c.repos),
    ...(data?.unaffiliated || []),
  ];
  const failing = 0;
  return (
    <div>
      <PaneHeader title="MCP Dashboard" subtitle="Overview of all servers" />
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-4 bg-white dark:bg-gray-900">
          <div className="text-xs text-gray-500 dark:text-gray-400">
            Total configured
          </div>
          <div className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
            {total}
          </div>
        </div>
        <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-4 bg-white dark:bg-gray-900">
          <div className="text-xs text-gray-500 dark:text-gray-400">Active</div>
          <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">
            {total}
          </div>
        </div>
        <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-4 bg-white dark:bg-gray-900">
          <div className="text-xs text-gray-500 dark:text-gray-400">
            Failing
          </div>
          <div className="text-2xl font-bold text-red-500 mt-1">{failing}</div>
        </div>
      </div>
      <h3 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">
        Repositories
      </h3>
      <div className="space-y-2">
        {allRepos.slice(0, 3).map((r) => (
          <div
            key={r.name}
            className="flex items-center gap-3 px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900"
          >
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
            <span className="text-sm font-medium text-gray-900 dark:text-white truncate flex-1">
              {r.name}
            </span>
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900 text-indigo-600 dark:text-indigo-400">
              {r.mcpServerCount} MCP
            </span>
          </div>
        ))}
        {allRepos.length === 0 && <EmptyState>No repositories yet</EmptyState>}
      </div>
    </div>
  );
}

function GlobalView({ data, onEditServer, onDeleteServer }) {
  const servers = data?.global?.servers || [];
  const connectors = data?.global?.connectors || [];
  return (
    <div>
      <PaneHeader
        title="Global"
        subtitle="Stored in ~/.claude.json — available in all Claude sessions"
      />
      {servers.length === 0 && connectors.length === 0 ? (
        <EmptyState>No global servers or connectors yet</EmptyState>
      ) : (
        <div className="space-y-4">
          {servers.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">
                Servers
              </h3>
              <div className="space-y-2">
                {servers.map((s) => (
                  <McpServerCard
                    key={s.name}
                    server={s}
                    status={s.status}
                    scope="global"
                    onEdit={onEditServer}
                    onDelete={onDeleteServer}
                  />
                ))}
              </div>
            </div>
          )}
          {connectors.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-2">
                Connectors (ever connected)
                <span
                  className="text-gray-300"
                  title="Claude.ai keeps the full history. Connection state may be stale — verify in claude.ai → Connectors."
                >
                  ⓘ
                </span>
              </h3>
              <div className="space-y-2">
                {connectors.map((c) => (
                  <McpServerCard
                    key={c.name}
                    server={{ name: c.name, config: {} }}
                    status="connector"
                    scope="global"
                    variant="connector"
                    readOnly
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function GlobalServerView({
  data,
  selectedNode,
  onEditServer,
  onDeleteServer,
}) {
  const id = selectedNode.id;
  const server = (data?.global?.servers || []).find((s) => s.name === id);
  const connector = (data?.global?.connectors || []).find((c) => c.name === id);
  if (!server && !connector) {
    return (
      <div>
        <PaneHeader title={id} subtitle="Global" />
        <EmptyState>Server not found</EmptyState>
      </div>
    );
  }
  if (connector) {
    return (
      <div>
        <PaneHeader title={connector.name} subtitle={connector.rawLabel} />
        <McpServerCard
          server={{ name: connector.name, config: {} }}
          status="connector"
          scope="global"
          variant="connector"
          readOnly
        />
      </div>
    );
  }
  return (
    <div>
      <PaneHeader title={server.name} subtitle="Global server" />
      <McpServerCard
        server={server}
        status={server.status}
        scope="global"
        onEdit={onEditServer}
        onDelete={onDeleteServer}
      />
    </div>
  );
}

function CompanyView({ data, selectedNode, onSelect }) {
  const co = (data?.companies || []).find((c) => c.id === selectedNode.id);
  if (!co) {
    return (
      <div>
        <PaneHeader title={selectedNode.id} subtitle="Company" />
        <EmptyState>Company not found</EmptyState>
      </div>
    );
  }
  return (
    <div>
      <PaneHeader
        title={co.name}
        accent={co.accent}
        subtitle={`${co.repos.length} repos`}
      />
      <div className="grid grid-cols-2 gap-3">
        {co.repos.map((r) => (
          <div
            key={r.name}
            className="border border-gray-200 dark:border-gray-700 rounded-xl p-4 bg-white dark:bg-gray-900"
          >
            <div className="flex items-center gap-2">
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
                {r.name}
              </span>
              <span className="text-xs px-1.5 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900 text-indigo-600 dark:text-indigo-400">
                {r.mcpServerCount}
              </span>
            </div>
            {r.path && (
              <p className="text-xs text-gray-400 dark:text-gray-500 font-mono truncate mt-1">
                {r.path}
              </p>
            )}
            <button
              onClick={() =>
                onSelect({ type: "repo", id: r.name, parentId: co.id })
              }
              className="mt-3 text-xs px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors"
            >
              Open
            </button>
          </div>
        ))}
        {co.repos.length === 0 && (
          <EmptyState>No repos yet for this company</EmptyState>
        )}
      </div>
    </div>
  );
}

function RepoView({
  repo,
  unaffiliated,
  onEditServer,
  onDeleteServer,
  onAddCatalogForRepo,
}) {
  if (!repo) {
    return (
      <div>
        <PaneHeader title="Repository" />
        <EmptyState>Repo not found</EmptyState>
      </div>
    );
  }
  return (
    <div>
      <PaneHeader
        title={repo.name}
        subtitle={repo.path}
        right={
          <button
            onClick={() => onAddCatalogForRepo(repo)}
            className="text-xs px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors shrink-0"
          >
            + Add MCP to this repo
          </button>
        }
      />
      {unaffiliated && (
        <div className="mb-4 px-3 py-2 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg text-xs text-amber-700 dark:text-amber-300">
          This repo is not in any company. Add it to{" "}
          <code className="font-mono">companies.json</code> to organize.
        </div>
      )}
      {repo.servers.length === 0 ? (
        <EmptyState>No MCP servers for this repository.</EmptyState>
      ) : (
        <div className="space-y-2">
          {repo.servers.map((s) => (
            <McpServerCard
              key={s.name}
              server={s}
              status={s.status}
              scope="repo"
              onEdit={(server) => onEditServer(server, repo)}
              onDelete={(server) => onDeleteServer(server, repo)}
            />
          ))}
        </div>
      )}
      <div className="mt-4 text-xs">
        <Link
          to={`/repos/${encodeURIComponent(repo.name)}`}
          className="text-indigo-600 dark:text-indigo-400 hover:underline"
        >
          View health →
        </Link>
      </div>
    </div>
  );
}

export default function McpDetailPane({
  data,
  selectedNode,
  onSelect,
  onEditServer,
  onDeleteServer,
  onAddCatalogForRepo,
}) {
  const node = selectedNode || { type: "dashboard" };

  let inner;
  if (node.type === "dashboard") {
    inner = <Dashboard data={data} />;
  } else if (node.type === "global") {
    inner = (
      <GlobalView
        data={data}
        onEditServer={onEditServer}
        onDeleteServer={onDeleteServer}
      />
    );
  } else if (node.type === "global-server") {
    inner = (
      <GlobalServerView
        data={data}
        selectedNode={node}
        onEditServer={onEditServer}
        onDeleteServer={onDeleteServer}
      />
    );
  } else if (node.type === "company") {
    inner = <CompanyView data={data} selectedNode={node} onSelect={onSelect} />;
  } else if (node.type === "repo") {
    const co = (data?.companies || []).find((c) => c.id === node.parentId);
    const repo = co?.repos.find((r) => r.name === node.id);
    inner = (
      <RepoView
        repo={repo}
        unaffiliated={false}
        onEditServer={onEditServer}
        onDeleteServer={onDeleteServer}
        onAddCatalogForRepo={onAddCatalogForRepo}
      />
    );
  } else if (node.type === "unaffiliated") {
    if (!node.id) {
      inner = (
        <div>
          <PaneHeader
            title="Unaffiliated"
            subtitle="Repos not in any company"
          />
          <div className="space-y-2">
            {(data?.unaffiliated || []).map((r) => (
              <button
                key={r.name}
                onClick={() => onSelect({ type: "unaffiliated", id: r.name })}
                className="w-full flex items-center gap-3 px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 hover:border-indigo-300 transition-colors"
              >
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
                <span className="text-sm font-medium text-gray-900 dark:text-white truncate flex-1 text-left">
                  {r.name}
                </span>
                <span className="text-xs px-1.5 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900 text-indigo-600 dark:text-indigo-400">
                  {r.mcpServerCount}
                </span>
              </button>
            ))}
            {(data?.unaffiliated || []).length === 0 && (
              <EmptyState>No unaffiliated repos</EmptyState>
            )}
          </div>
        </div>
      );
    } else {
      const repo = (data?.unaffiliated || []).find((r) => r.name === node.id);
      inner = (
        <RepoView
          repo={repo}
          unaffiliated
          onEditServer={onEditServer}
          onDeleteServer={onDeleteServer}
          onAddCatalogForRepo={onAddCatalogForRepo}
        />
      );
    }
  } else {
    inner = <Dashboard data={data} />;
  }

  return <div className="max-w-3xl">{inner}</div>;
}

export { StatusBadge };
