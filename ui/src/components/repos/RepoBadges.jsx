function Badge({ tone, label, sub, title }) {
  const tones = {
    green:
      "bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900",
    gray: "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700",
    indigo:
      "bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-900",
    amber:
      "bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-900",
    red: "bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300 border-red-200 dark:border-red-900",
  };
  return (
    <span
      title={title || undefined}
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-medium ${tones[tone] || tones.gray}`}
    >
      <span>{label}</span>
      {sub && <span className="opacity-70 font-normal">{sub}</span>}
    </span>
  );
}

function formatBytes(n) {
  if (n == null) return null;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function formatMtime(iso) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default function RepoBadges({ health }) {
  if (!health) return null;
  const { claudeMd, settings, agents, skills, mcp, links } = health;

  const claudeTitle = claudeMd?.exists
    ? `mtime: ${formatMtime(claudeMd.mtime)} · ${formatBytes(claudeMd.size)}`
    : "No CLAUDE.md";

  const settingsSub = settings?.exists
    ? `${settings.hookCount} hooks · ${settings.permissionAllowCount} allows`
    : null;
  const settingsTitle = settings?.exists
    ? `settings.json present${settings.localExists ? " (with .local)" : ""} · deny: ${settings.permissionDenyCount} · additionalDirs: ${settings.additionalDirectoriesCount}`
    : "No .claude/settings.json";

  const mcpSub = mcp
    ? `${mcp.dotMcpJsonServerCount}/${(mcp.enabledMcpServers || []).length}e`
    : null;
  const mcpTitle = mcp
    ? `.mcp.json: ${mcp.dotMcpJsonExists ? "yes" : "no"} (${mcp.dotMcpJsonServerCount} servers) · workspace-managed: ${mcp.workspaceManagedServerCount} · enabled: ${(mcp.enabledMcpServers || []).length} · disabled: ${(mcp.disabledMcpServers || []).length}`
    : "";

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Badge
        tone={claudeMd?.exists ? "green" : "gray"}
        label="CLAUDE.md"
        title={claudeTitle}
      />
      <Badge
        tone={settings?.exists ? "green" : "gray"}
        label="settings"
        sub={settingsSub}
        title={settingsTitle}
      />
      <Badge
        tone={agents?.count ? "indigo" : "gray"}
        label="agents"
        sub={`${agents?.count ?? 0}`}
        title={
          agents?.count ? (agents.names || []).join(", ") : "No agents/*.md"
        }
      />
      <Badge
        tone={skills?.count ? "indigo" : "gray"}
        label="skills"
        sub={`${skills?.count ?? 0}`}
        title={skills?.count ? (skills.names || []).join(", ") : "No skills/"}
      />
      <Badge
        tone={
          mcp?.dotMcpJsonExists || (mcp?.enabledMcpServers || []).length
            ? "indigo"
            : "gray"
        }
        label="MCP"
        sub={mcpSub}
        title={mcpTitle}
      />
      <Badge
        tone={
          links?.status === "linked"
            ? "green"
            : links?.status === "partial"
              ? "amber"
              : links?.status === "broken"
                ? "red"
                : "gray"
        }
        label="Workspace links"
        sub={
          links?.status === "linked"
            ? "ok"
            : links?.status === "partial"
              ? `${(links.missing || []).length} missing`
              : links?.status === "broken"
                ? `${(links.broken || []).length} broken`
                : "off"
        }
        title={
          !links
            ? "Workspace links: unknown"
            : links.status === "linked"
              ? "All workspace agents linked"
              : links.status === "partial"
                ? `${(links.missing || []).length} missing, ${(links.overrides || []).length} overrides`
                : links.status === "broken"
                  ? `${(links.broken || []).length} broken symlinks (workspace moved?)`
                  : "Not linked to workspace — click Repair"
        }
      />
    </div>
  );
}
