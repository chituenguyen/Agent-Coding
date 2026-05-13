import ThreadRow from "./ThreadRow";

export default function ThreadSidebar({
  threads,
  activeThreadId,
  team,
  onSelect,
  onCreate,
  onDelete,
}) {
  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-co-fg/10 bg-co-surface/60">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b border-co-fg/10 px-3 py-2.5">
        <div className="min-w-0">
          <div className="truncate text-xs font-semibold tracking-tight text-co-fg/80">
            {team?.name || "Team"}
          </div>
          <div className="text-[10px] uppercase tracking-wider text-co-fg/40">
            Threads · {threads.length}
          </div>
        </div>
        <button
          onClick={onCreate}
          title="New thread"
          className="rounded-co-sm border border-co-fg/15 px-2 py-1 text-xs text-co-fg/70 hover:bg-co-fg/[0.06] hover:text-co-fg"
        >
          + New
        </button>
      </div>

      {/* Scroll list */}
      <div className="min-h-0 flex-1 overflow-y-auto py-1">
        {threads.length === 0 && (
          <div className="px-3 py-6 text-center text-[11px] text-co-fg/40">
            No threads yet
          </div>
        )}
        {threads.map((t) => (
          <ThreadRow
            key={t.id}
            thread={t}
            active={t.id === activeThreadId}
            onSelect={() => onSelect(t.id)}
            onDelete={() => onDelete(t.id)}
          />
        ))}
      </div>
    </aside>
  );
}
