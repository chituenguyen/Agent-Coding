// Shows whether "Claude in Chrome" is enabled in ~/.claude.json.
// The backend can only see config state — live reachability of the
// extension is only verifiable from inside a Claude Code session by
// invoking a chrome tool. The "Test live connection" button copies a
// ready-to-paste prompt the user can run in their Claude session.

import { useEffect, useState } from "react";
import { toast } from "sonner";

const LIVE_TEST_PROMPT =
  "Run mcp__claude-in-chrome__tabs_context_mcp and tell me if it responds.";

export default function ChromeMcpStatus() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/chrome-mcp/status");
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setData(await r.json());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  function copyLiveTest() {
    navigator.clipboard.writeText(LIVE_TEST_PROMPT).then(
      () =>
        toast.success("Test prompt copied", {
          description:
            "Paste it into a Claude Code session to verify live connection.",
          duration: 4000,
        }),
      () => toast.error("Copy failed"),
    );
  }

  const enabled = data?.enabled;
  const onboarded = data?.onboarded;
  const statusColor =
    enabled && onboarded
      ? "bg-emerald-500"
      : enabled
        ? "bg-amber-500"
        : "bg-rose-500";
  const statusText = loading
    ? "Checking…"
    : error
      ? "Error"
      : enabled && onboarded
        ? "Enabled & onboarded"
        : enabled
          ? "Enabled (not onboarded)"
          : "Disabled";

  return (
    <div className="rounded-co-md border border-co-fg/10 bg-co-surface/60 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={`inline-block h-2 w-2 rounded-full ${statusColor}`}
            />
            <h3 className="text-sm font-medium text-co-fg">Claude in Chrome</h3>
            <span className="text-[11px] text-co-fg/50">{statusText}</span>
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-co-fg/55">
            Config state from <code className="font-mono">~/.claude.json</code>.
            Live reachability of the Chrome extension can only be verified from
            a Claude Code session — use the Test button.
          </p>
          {error && <p className="mt-1 text-[11px] text-rose-500">{error}</p>}
        </div>
        <div className="flex shrink-0 gap-1.5">
          <button
            onClick={refresh}
            disabled={loading}
            className="rounded-co-sm border border-co-fg/15 px-2.5 py-1 text-[11px] text-co-fg/70 hover:bg-co-fg/[0.04] disabled:opacity-50"
          >
            Refresh
          </button>
          <button
            onClick={copyLiveTest}
            className="rounded-co-sm bg-co-accent px-2.5 py-1 text-[11px] font-medium text-co-bg hover:opacity-90"
          >
            Test live
          </button>
        </div>
      </div>
    </div>
  );
}
