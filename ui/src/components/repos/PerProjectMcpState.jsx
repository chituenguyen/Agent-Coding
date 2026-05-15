function List({ title, items }) {
  return (
    <div>
      <h4 className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1.5">
        {title} <span className="font-normal opacity-70">({items.length})</span>
      </h4>
      {items.length === 0 ? (
        <p className="text-xs text-gray-400 dark:text-gray-500 italic">
          (none)
        </p>
      ) : (
        <ul className="space-y-1">
          {items.map((name) => (
            <li
              key={name}
              className="text-xs font-mono text-gray-700 dark:text-gray-300 truncate"
            >
              {name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function PerProjectMcpState({ health }) {
  const mcp = health?.mcp;
  if (!mcp) return null;
  return (
    <div className="grid grid-cols-2 gap-4">
      <List title="Enabled MCP servers" items={mcp.enabledMcpServers || []} />
      <List title="Disabled MCP servers" items={mcp.disabledMcpServers || []} />
      <List
        title="Enabled .mcp.json servers"
        items={mcp.enabledMcpjsonServers || []}
      />
      <List
        title="Disabled .mcp.json servers"
        items={mcp.disabledMcpjsonServers || []}
      />
    </div>
  );
}
