import { useState, useEffect, useRef } from "react";
import { api } from "../api";
import MarkdownContent from "./MarkdownContent";

export default function RecallPanel({ query, file, project, onPick, mode }) {
  const [hits, setHits] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const debounceRef = useRef(null);

  // Debounced recall fetch
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!query) {
      setHits([]);
      setError(null);
      return;
    }

    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const result = await api.recall({ q: query, file, project, limit: 5 });
        setHits(result.hits || []);
        setError(null);
      } catch (err) {
        setError(err.message);
        setHits([]);
      } finally {
        setLoading(false);
      }
    }, 250);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, file, project]);

  if (!query) return null;

  if (loading) {
    return (
      <div className="px-4 py-2 text-xs text-co-fg/50 animate-pulse">
        recalling…
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-4 py-2 text-xs text-co-fg/50">
        recall failed: {error}
      </div>
    );
  }

  if (hits.length === 0) {
    if (mode === "command") {
      return (
        <div className="px-4 py-2 text-xs text-co-fg/50">
          no prior context found
        </div>
      );
    }
    return null;
  }

  if (mode === "auto") {
    const hit = hits[0];
    const relDate = formatRelativeDate(hit.ts);

    if (expandedId) {
      // Expanded auto-mode: show full hit list
      return (
        <div className="mb-3 space-y-2 p-3 bg-co-fg/[0.02] border border-co-fg/10 rounded-lg">
          {hits.map((h) => (
            <HitCard
              key={h.turn_id}
              hit={h}
              expanded={expandedId === h.turn_id}
              onToggleExpand={() =>
                setExpandedId(expandedId === h.turn_id ? null : h.turn_id)
              }
            />
          ))}
        </div>
      );
    }

    // Collapsed auto-mode: bubble
    return (
      <button
        type="button"
        onClick={() => setExpandedId(hit.turn_id)}
        className="mb-2 px-3 py-2 text-xs bg-co-fg/[0.05] border border-co-fg/10 rounded-lg text-co-fg/70 hover:bg-co-fg/[0.08] hover:border-co-fg/20 transition-colors text-left"
      >
        <span className="font-medium">
          You discussed this {relDate} — view?
        </span>
      </button>
    );
  }

  // mode === "command"
  return (
    <div className="mb-3 space-y-2 p-3 bg-co-fg/[0.02] border border-co-fg/10 rounded-lg">
      {hits.map((hit) => (
        <HitCard
          key={hit.turn_id}
          hit={hit}
          expanded={expandedId === hit.turn_id}
          onToggleExpand={() =>
            setExpandedId(expandedId === hit.turn_id ? null : hit.turn_id)
          }
        />
      ))}
    </div>
  );
}

function HitCard({ hit, expanded, onToggleExpand }) {
  const relDate = formatRelativeDate(hit.ts);
  const absDate = new Date(hit.ts).toLocaleString();
  const sessionPrefix = hit.session_id.slice(0, 8);
  const files = hit.files || [];
  const basenames = files.map((p) => p.split("/").pop()).join(", ");
  const displayText = hit.text.slice(0, 200);

  return (
    <div className="border border-co-fg/10 rounded-lg overflow-hidden bg-co-surface/50">
      <button
        type="button"
        onClick={onToggleExpand}
        className="w-full text-left p-2.5 hover:bg-co-fg/[0.05] transition-colors flex flex-col gap-1.5"
      >
        <div className="text-xs text-co-fg/60 flex items-center gap-2">
          <span title={absDate}>{relDate}</span>
          <span>·</span>
          <span className="font-mono text-co-fg/50">{hit.project}</span>
          <span>·</span>
          <span className="font-mono text-co-fg/50">
            session {sessionPrefix}…
          </span>
        </div>
        {files.length > 0 && (
          <div className="text-xs text-co-fg/60">
            <span className="text-co-fg/50">files:</span> {basenames}
          </div>
        )}
        <div className="text-sm text-co-fg line-clamp-2">
          {displayText}
          {hit.text.length > 200 && "…"}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-co-fg/10 px-2.5 py-2 bg-co-bg/50 space-y-2">
          <MarkdownContent content={hit.text} />
          <div className="flex items-center justify-between gap-2 pt-1 border-t border-co-fg/10">
            <span className="text-[10px] text-co-fg/40 font-mono truncate">
              {hit.source_path}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function formatRelativeDate(ts) {
  const now = Date.now();
  const diff = now - ts;
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) return "today";
  if (days === 1) return "1 day ago";
  if (days < 7) return `${days} days ago`;
  if (days < 30) {
    const weeks = Math.floor(days / 7);
    return `${weeks} week${weeks > 1 ? "s" : ""} ago`;
  }
  if (days < 365) {
    const months = Math.floor(days / 30);
    return `${months} month${months > 1 ? "s" : ""} ago`;
  }
  const years = Math.floor(days / 365);
  return `${years} year${years > 1 ? "s" : ""} ago`;
}
