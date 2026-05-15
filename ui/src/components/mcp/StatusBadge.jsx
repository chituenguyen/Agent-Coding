const STATUS = {
  active: {
    icon: "●",
    color: "text-emerald-500",
    label: "Active",
    tooltip: "Configured and enabled",
  },
  disabled: {
    icon: "○",
    color: "text-gray-400",
    label: "Disabled",
    tooltip: "Disabled in this project — toggle via /mcp in Claude CLI",
  },
  broken: {
    icon: "▲",
    color: "text-red-500",
    label: "Broken",
    tooltip: "Health check failed — see details",
  },
  connector: {
    icon: "◆",
    color: "text-blue-500",
    label: "Connector",
    tooltip: "Claude.ai OAuth connector — manage in claude.ai",
  },
};

export default function StatusBadge({
  status,
  transport,
  label,
  className = "",
}) {
  const cfg = STATUS[status] || STATUS.active;
  return (
    <span
      className={`inline-flex items-center gap-1.5 ${className}`}
      title={cfg.tooltip}
    >
      <span className={`${cfg.color} text-sm leading-none`} aria-hidden>
        {cfg.icon}
      </span>
      {label && (
        <span className="text-xs text-gray-600 dark:text-gray-300">
          {label}
        </span>
      )}
      {transport && (
        <span className="text-xs px-1.5 py-0.5 rounded font-mono bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
          {transport}
        </span>
      )}
    </span>
  );
}
