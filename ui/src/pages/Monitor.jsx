import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { api } from "../api";

// Parse `abtop --once` plain-text output into structured sessions.
// Format (per session):
//   "  <pid> <project>[(<ref>)]  <title>  <icon> <state> <model>   CTX: <n>% Tok:<v> Mem:<v> <age>"
//   followed by 7-space-indented child lines (either "└── <tool> <args>" or "<pid> <cmd> <mem>")
function parseAbtopSnapshot(text) {
  if (!text) return { summary: "", sessions: [] };
  const lines = text.split("\n");
  const summary = (lines[0] || "").trim();
  const sessions = [];
  let cur = null;
  const flush = () => {
    if (cur) sessions.push(cur);
  };
  // Age can be multi-token like "1h 38m" or "2d 4h", so capture the tail lazily.
  const metricsRe = /CTX:\s*(\d+)%\s+Tok:(\S+)\s+Mem:(\S+)\s+(.+?)\s*$/;
  const tailRe = /(\S)\s+(Exec|Wait|Idle|Stop|Done|Run)\s+(\S+)\s*$/;

  for (let i = 1; i < lines.length; i++) {
    const ln = lines[i];
    if (!ln.trim()) continue;
    const isSession = /^ {2}\d+\s/.test(ln);
    const isChild = /^ {7,}\S/.test(ln);

    if (isSession) {
      flush();
      const m = ln.match(/^ {2}(\d+)\s+(.+)$/);
      const pid = m[1];
      let rest = m[2];
      const met = rest.match(metricsRe);
      let ctx = null,
        tok = null,
        mem = null,
        age = null;
      if (met) {
        ctx = +met[1];
        tok = met[2];
        mem = met[3];
        age = met[4];
        rest = rest.slice(0, met.index).trimEnd();
      }
      const tail = rest.match(tailRe);
      let icon = null,
        state = null,
        model = null;
      if (tail) {
        icon = tail[1];
        state = tail[2];
        model = tail[3];
        rest = rest.slice(0, tail.index).trimEnd();
      }
      const projMatch = rest.match(/^(\S+?)(?:\(([^)]+)\))?\s+(.*)$/);
      let project = null,
        ref = null,
        title = rest;
      if (projMatch) {
        project = projMatch[1];
        ref = projMatch[2] || null;
        title = projMatch[3].trim();
      }
      cur = {
        pid,
        project,
        ref,
        title,
        icon,
        state,
        model,
        ctx,
        tok,
        mem,
        age,
        children: [],
      };
    } else if (isChild && cur) {
      const c = ln.trim();
      const isTool = c.startsWith("└──") || c.startsWith("├──");
      cur.children.push({
        text: c.replace(/^[└├]──\s*/, ""),
        tool: isTool,
      });
    }
  }
  flush();
  return { summary, sessions };
}

function ctxBarColor(pct) {
  if (pct == null) return "bg-co-fg/40";
  if (pct >= 85) return "bg-red-400";
  if (pct >= 65) return "bg-amber-400";
  return "bg-emerald-400";
}

function StateBadge({ state }) {
  const map = {
    Exec: { dot: "bg-emerald-400", label: "text-emerald-300" },
    Run: { dot: "bg-emerald-400", label: "text-emerald-300" },
    Wait: { dot: "bg-amber-300", label: "text-amber-200" },
    Idle: { dot: "bg-slate-400", label: "text-slate-300" },
    Stop: { dot: "bg-slate-500", label: "text-slate-400" },
    Done: { dot: "bg-slate-500", label: "text-slate-400" },
  };
  const cfg = map[state] || { dot: "bg-slate-400", label: "text-slate-300" };
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full bg-white/[0.04] px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider ${cfg.label}`}
    >
      <span
        className={`relative inline-flex h-1.5 w-1.5 rounded-full ${cfg.dot}`}
      >
        {state === "Exec" || state === "Run" ? (
          <span
            className={`absolute inset-0 inline-flex animate-ping rounded-full opacity-70 ${cfg.dot}`}
          />
        ) : null}
      </span>
      {state || "—"}
    </span>
  );
}

function SessionCard({ s }) {
  return (
    <div className="rounded-co-lg border border-white/[0.07] bg-white/[0.02] p-4 transition-colors hover:bg-white/[0.035]">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="font-mono text-[10px] text-white/30">{s.pid}</span>
          <h3 className="truncate text-sm font-semibold text-white">
            {s.project || "—"}
          </h3>
          {s.ref && (
            <code className="rounded bg-white/[0.08] px-1.5 py-0.5 font-mono text-[10px] text-sky-300/80">
              {s.ref}
            </code>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {s.state && <StateBadge state={s.state} />}
          {s.model && (
            <code className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[10px] text-white/70">
              {s.model}
            </code>
          )}
        </div>
      </div>

      {s.title && (
        <p className="mt-1.5 truncate text-[13px] text-white/75">{s.title}</p>
      )}

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-[1.4fr_auto_auto_auto] sm:items-center">
        <div>
          <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-wider text-white/40">
            <span>CTX</span>
            <span className="text-white/75">
              {s.ctx != null ? `${s.ctx}%` : "—"}
            </span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
            <div
              className={`h-full rounded-full transition-all ${ctxBarColor(s.ctx)}`}
              style={{ width: `${Math.min(100, s.ctx ?? 0)}%` }}
            />
          </div>
        </div>
        <Stat label="Tok" value={s.tok} />
        <Stat label="Mem" value={s.mem} />
        <Stat value={s.age} mono />
      </div>

      {s.children.length > 0 && (
        <ul className="mt-3 space-y-0.5 border-t border-white/[0.05] pt-2.5 font-mono text-[11px]">
          {s.children.map((c, i) => (
            <li
              key={i}
              className={`truncate ${c.tool ? "text-white/85" : "pl-3 text-white/45"}`}
            >
              {c.tool && <span className="mr-1 text-white/30">└─</span>}
              {c.text}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Stat({ label, value, mono }) {
  if (!value) return null;
  return (
    <div className="text-right">
      {label && (
        <div className="text-[10px] font-mono uppercase tracking-wider text-white/40">
          {label}
        </div>
      )}
      <div
        className={`text-[11px] text-white/80 ${mono || label ? "font-mono" : ""}`}
      >
        {value}
      </div>
    </div>
  );
}

function fmtAge(at) {
  if (!at) return "—";
  const ms = Date.now() - new Date(at).getTime();
  if (ms < 1000) return "just now";
  if (ms < 60_000) return `${Math.floor(ms / 1000)}s ago`;
  return `${Math.floor(ms / 60_000)}m ago`;
}

function InstallCTA({
  version,
  onRetry,
  checking,
  onInstall,
  installing,
  installLog,
  installErr,
}) {
  const logRef = useRef(null);
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [installLog]);
  return (
    <div className="cofounder-skin relative min-h-full bg-co-bg">
      <div className="relative mx-auto max-w-3xl px-8 py-10">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-co-fg/40">
          <span className="h-px w-6 bg-co-fg/20" />
          Live monitoring
        </div>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-co-fg">
          Monitor
        </h1>
        <p className="mt-1.5 text-xs text-co-fg/55">
          Live snapshot of every Claude / Codex / OpenCode session on this
          machine, powered by{" "}
          <a
            href="https://github.com/graykode/abtop"
            target="_blank"
            rel="noreferrer"
            className="underline decoration-co-fg/30 underline-offset-2 hover:decoration-co-fg/70"
          >
            abtop
          </a>
          .
        </p>

        <div className="mt-8 rounded-co-lg border border-dashed border-co-fg/15 bg-co-surface p-6">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-co bg-co-fg/[0.05] text-co-fg/60">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <path d="M12 8v4M12 16h.01" />
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-semibold tracking-tight text-co-fg">
                abtop isn't installed
              </h2>
              <p className="mt-1 text-xs text-co-fg/55">
                Install the{" "}
                <code className="rounded bg-co-fg/[0.06] px-1 py-0.5 font-mono">
                  abtop
                </code>{" "}
                CLI on this host, then come back here. It's a small Rust TUI
                that reads{" "}
                <code className="rounded bg-co-fg/[0.06] px-1 py-0.5 font-mono">
                  ~/.claude
                </code>{" "}
                in read-only mode.
              </p>

              <div className="mt-5 space-y-3">
                <div>
                  <div className="mb-1 flex items-center justify-between gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-co-fg/45">
                    <span>Install on this host</span>
                    <span className="font-mono normal-case tracking-normal text-co-fg/30">
                      curl …/abtop-installer.sh | sh
                    </span>
                  </div>
                  {(installing || installLog) && (
                    <pre
                      ref={logRef}
                      className="mb-2 max-h-48 overflow-y-auto whitespace-pre-wrap break-words rounded-co border border-co-fg/10 bg-[#0b0c10] p-3 font-mono text-[11px] leading-snug text-slate-100"
                    >
                      {installLog || "Starting…"}
                    </pre>
                  )}
                  {installErr && (
                    <div className="mb-2 rounded-co border border-co-destructive/30 bg-co-destructive/[0.06] px-3 py-2 text-xs text-co-destructive">
                      {installErr}
                    </div>
                  )}
                  <button
                    onClick={onInstall}
                    disabled={installing || checking}
                    className="inline-flex items-center gap-2 rounded-full bg-co-fg px-4 py-1.5 text-[12px] font-medium text-co-bg transition-all hover:opacity-90 disabled:opacity-60"
                  >
                    {installing ? (
                      <>
                        <svg
                          className="h-3 w-3 animate-spin"
                          fill="none"
                          viewBox="0 0 24 24"
                        >
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                          />
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8v8z"
                          />
                        </svg>
                        Installing…
                      </>
                    ) : installErr ? (
                      "Try again"
                    ) : (
                      "Install now"
                    )}
                  </button>
                </div>
                <div>
                  <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-co-fg/45">
                    Or via cargo
                  </div>
                  <pre className="overflow-x-auto rounded-co bg-co-fg/[0.04] p-3 font-mono text-[11px] text-co-fg/85">
                    cargo install abtop
                  </pre>
                </div>
              </div>

              <div className="mt-5 flex items-center gap-3">
                <button
                  onClick={onRetry}
                  disabled={checking || installing}
                  className="inline-flex items-center gap-2 rounded-full border border-co-fg/15 bg-transparent px-4 py-1.5 text-[12px] font-medium text-co-fg/80 transition-all hover:bg-co-fg/[0.04] disabled:opacity-60"
                >
                  {checking ? (
                    <>
                      <svg
                        className="h-3 w-3 animate-spin"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8v8z"
                        />
                      </svg>
                      Checking…
                    </>
                  ) : (
                    "Recheck"
                  )}
                </button>
                <a
                  href="https://github.com/graykode/abtop"
                  target="_blank"
                  rel="noreferrer"
                  className="text-[12px] text-co-fg/55 hover:text-co-fg/80"
                >
                  Repo & docs →
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Monitor() {
  const [installed, setInstalled] = useState(null); // null=checking, false=missing, true=ok
  const [version, setVersion] = useState(null);
  const [checking, setChecking] = useState(false);
  const [snap, setSnap] = useState(null);
  const [err, setErr] = useState(null);
  const [installing, setInstalling] = useState(false);
  const [installLog, setInstallLog] = useState("");
  const [installErr, setInstallErr] = useState(null);
  const cancelInstallRef = useRef(null);

  const runCheck = useCallback(async () => {
    setChecking(true);
    try {
      const r = await api.checkMonitor();
      setInstalled(!!r.installed);
      setVersion(r.version || null);
    } catch {
      setInstalled(false);
    } finally {
      setChecking(false);
    }
  }, []);

  const runInstall = useCallback(() => {
    if (installing) return;
    setInstalling(true);
    setInstallLog("");
    setInstallErr(null);
    cancelInstallRef.current = api.installMonitor({
      onLog: ({ text }) => setInstallLog((s) => s + text),
      onDone: ({ ok, code, error }) => {
        setInstalling(false);
        cancelInstallRef.current = null;
        if (ok) {
          runCheck();
        } else {
          setInstallErr(error || `install failed (exit ${code})`);
        }
      },
    });
  }, [installing, runCheck]);

  useEffect(() => {
    return () => {
      if (cancelInstallRef.current) cancelInstallRef.current();
    };
  }, []);

  useEffect(() => {
    runCheck();
  }, [runCheck]);

  useEffect(() => {
    if (installed !== true) return;
    let cancelled = false;
    const load = async () => {
      try {
        const r = await api.getMonitorSnapshot();
        if (cancelled) return;
        if (r.missing) {
          setInstalled(false);
          return;
        }
        setSnap(r);
        setErr(null);
      } catch (e) {
        if (!cancelled) setErr(e.message || String(e));
      }
    };
    load();
    const id = setInterval(load, 5000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [installed]);

  const parsed = useMemo(() => parseAbtopSnapshot(snap?.text || ""), [snap]);

  if (installed === null) {
    return (
      <div className="cofounder-skin min-h-full bg-co-bg">
        <div className="flex items-center gap-2 p-8 text-sm text-co-fg/45">
          <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8v8z"
            />
          </svg>
          Detecting abtop…
        </div>
      </div>
    );
  }

  if (installed === false) {
    return (
      <InstallCTA
        version={version}
        onRetry={runCheck}
        checking={checking}
        onInstall={runInstall}
        installing={installing}
        installLog={installLog}
        installErr={installErr}
      />
    );
  }

  return (
    <div className="cofounder-skin relative min-h-full bg-co-bg">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 h-[420px] w-[420px] -translate-x-1/2 rounded-full opacity-[0.06] blur-3xl"
        style={{
          background:
            "radial-gradient(circle, rgb(var(--co-accent-rgb)) 0%, transparent 70%)",
        }}
      />

      <div className="relative mx-auto max-w-6xl px-8 py-10">
        <header className="mb-6 flex items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-co-fg/40">
              <span className="h-px w-6 bg-co-fg/20" />
              Live monitoring
            </div>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-co-fg">
              Monitor
            </h1>
            <p className="mt-1.5 text-xs text-co-fg/55">
              Live snapshot of every Claude / Codex / OpenCode session on this
              machine{" "}
              {version && (
                <>
                  ·{" "}
                  <code className="rounded bg-co-fg/[0.06] px-1.5 py-0.5 font-mono text-co-fg/80">
                    {version}
                  </code>
                </>
              )}
            </p>
          </div>
          <div className="inline-flex shrink-0 items-center gap-2 rounded-full bg-co-fg/[0.05] px-3 py-1.5 text-[11px] text-co-fg/60">
            <span className="relative inline-flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-co-success opacity-60" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-co-success" />
            </span>
            Auto-refresh
            <span className="text-co-fg/40">·</span>
            <span className="font-mono">5s</span>
            {snap?.at && (
              <>
                <span className="text-co-fg/40">·</span>
                <span className="font-mono">{fmtAge(snap.at)}</span>
              </>
            )}
          </div>
        </header>

        {err && (
          <div className="mb-4 rounded-co border border-co-destructive/30 bg-co-destructive/[0.06] px-4 py-2 text-xs text-co-destructive">
            {err}
          </div>
        )}

        <div className="overflow-hidden rounded-co-lg border border-co-fg/10 bg-[#0b0c10]">
          <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-2">
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-red-400/70" />
              <span className="h-2.5 w-2.5 rounded-full bg-yellow-400/70" />
              <span className="h-2.5 w-2.5 rounded-full bg-green-400/70" />
            </div>
            <div className="font-mono text-[10px] uppercase tracking-wider text-white/30">
              {parsed.summary || "abtop --once"}
            </div>
          </div>
          {parsed.sessions.length > 0 ? (
            <div className="grid grid-cols-1 gap-3 p-4 lg:grid-cols-2">
              {parsed.sessions.map((s) => (
                <SessionCard key={s.pid} s={s} />
              ))}
            </div>
          ) : snap?.text ? (
            <div className="px-4 py-10 text-center text-xs text-white/45">
              No active sessions detected.
            </div>
          ) : (
            <div className="flex items-center gap-2 px-4 py-10 text-xs text-white/45">
              <svg
                className="h-3.5 w-3.5 animate-spin"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8v8z"
                />
              </svg>
              Loading snapshot…
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
