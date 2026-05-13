import { useState } from "react";

export default function ThreadRow({ thread, active, onSelect, onDelete }) {
  const [confirming, setConfirming] = useState(false);

  return (
    <div
      className={`group relative mx-1 mb-0.5 flex items-center gap-2 rounded-co-sm px-2 py-1.5 text-left transition-colors ${
        active
          ? "bg-co-primary/15 text-co-fg"
          : "text-co-fg/70 hover:bg-co-fg/[0.05] hover:text-co-fg"
      }`}
    >
      <button
        onClick={onSelect}
        className="min-w-0 flex-1 truncate text-left text-xs"
        title={thread.title}
      >
        {thread.title || "New thread"}
      </button>
      {confirming ? (
        <>
          <button
            onClick={() => {
              onDelete();
              setConfirming(false);
            }}
            className="rounded px-1 text-[10px] text-co-destructive hover:bg-co-destructive/10"
          >
            Delete?
          </button>
          <button
            onClick={() => setConfirming(false)}
            className="rounded px-1 text-[10px] text-co-fg/50 hover:bg-co-fg/[0.05]"
          >
            ✕
          </button>
        </>
      ) : (
        <button
          onClick={() => setConfirming(true)}
          className="rounded p-1 text-[11px] text-co-fg/30 opacity-0 hover:bg-co-fg/[0.05] hover:text-co-destructive group-hover:opacity-100"
          title="Delete thread"
        >
          🗑
        </button>
      )}
    </div>
  );
}
