import { useState, useEffect } from 'react'
import { api } from '../api'

const KIND_LABELS = {
  chat: 'Chat',
  investigate: 'Investigate',
  workflow: 'Workflow',
  task: 'Task',
  fix: 'Bug Fix',
  subtask: 'Sub-task',
  command: 'Command',
  unknown: 'Other',
}

// Hex colors so we can compose accent-tinted gradients inline.
const KIND_HEX = {
  chat: '#6366f1',
  investigate: '#f59e0b',
  workflow: '#10b981',
  task: '#10b981',
  fix: '#f97316',
  subtask: '#8b5cf6',
  command: '#0ea5e9',
  unknown: '#94a3b8',
}

const fmtUsd = (n) => `$${(n || 0).toFixed(4)}`
const fmtTokens = (n) => {
  if (!n) return '0'
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'k'
  return String(n)
}
const fmtDuration = (ms) => {
  if (!ms) return '—'
  if (ms < 1000) return `${ms} ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`
  return `${(ms / 60_000).toFixed(1)} min`
}

// ─── stat card ──────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, icon, primary }) {
  return (
    <div
      className={`relative overflow-hidden rounded-co-lg border bg-co-surface p-5 transition-all hover:-translate-y-0.5 ${
        primary
          ? 'border-co-fg/15 shadow-[0_8px_24px_-12px_rgba(0,0,0,0.18)]'
          : 'border-co-fg/10'
      }`}
    >
      {primary && (
        <>
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-px opacity-60"
            style={{
              background:
                'linear-gradient(90deg, transparent, rgb(var(--co-accent-rgb)), transparent)',
            }}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full opacity-25 blur-2xl"
            style={{
              background:
                'radial-gradient(circle, rgb(var(--co-accent-rgb)) 0%, transparent 70%)',
            }}
          />
        </>
      )}
      <div className="relative flex items-start justify-between gap-3">
        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-co-fg/45">
          {label}
        </div>
        {icon && (
          <span className="text-co-fg/40" aria-hidden>
            {icon}
          </span>
        )}
      </div>
      <div
        className={`relative mt-2 text-2xl font-semibold tracking-tight ${
          primary ? 'text-co-fg' : 'text-co-fg/90'
        }`}
      >
        {value}
      </div>
      {sub && (
        <div className="relative mt-1 text-[11px] text-co-fg/50">{sub}</div>
      )}
    </div>
  )
}

// ─── horizontal bar (by kind / by model) ────────────────────────────────────

function Bar({ items, total }) {
  return (
    <div className="space-y-3">
      {items.map(([key, data]) => {
        const pct = total > 0 ? (data.cost_usd / total) * 100 : 0
        const color = KIND_HEX[key] || '#6b7280'
        return (
          <div key={key} className="group">
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="inline-flex items-center gap-1.5 font-medium text-co-fg/80">
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: color }}
                />
                {KIND_LABELS[key] || key}
              </span>
              <span className="font-mono text-[11px] text-co-fg/50">
                {fmtUsd(data.cost_usd)}
                <span className="mx-1.5 text-co-fg/25">·</span>
                {data.runs} run{data.runs === 1 ? '' : 's'}
                <span className="mx-1.5 text-co-fg/25">·</span>
                <span className="text-co-fg/70">{pct.toFixed(1)}%</span>
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-co-fg/[0.06]">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${pct}%`,
                  background: `linear-gradient(90deg, ${color}cc, ${color})`,
                  boxShadow: `0 0 8px ${color}66`,
                }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── daily cost chart ───────────────────────────────────────────────────────

function ChartByDate({ byDate }) {
  // Fill missing days so the chart always shows 14 contiguous bars
  const today = new Date()
  const days = []
  for (let i = 13; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    const key = d.toISOString().slice(0, 10)
    days.push({ key, cost: byDate[key]?.cost_usd || 0, runs: byDate[key]?.runs || 0 })
  }
  const max = Math.max(...days.map(d => d.cost), 0.0001)
  const hasData = days.some(d => d.cost > 0)

  return (
    <div className="relative">
      {!hasData && (
        <div className="absolute inset-0 z-10 flex items-center justify-center">
          <div className="rounded-co border border-dashed border-co-fg/15 bg-co-bg/80 px-4 py-2 text-xs text-co-fg/55">
            No runs yet — trigger a workflow or chat to start tracking
          </div>
        </div>
      )}
      <div className="flex h-36 items-end gap-1.5">
        {days.map((d) => {
          const h = Math.max(2, (d.cost / max) * 100)
          const isToday = d.key === today.toISOString().slice(0, 10)
          return (
            <div
              key={d.key}
              className="group relative flex flex-1 flex-col items-center justify-end"
            >
              <div
                className="w-full rounded-t transition-all duration-300 hover:opacity-100"
                style={{
                  height: `${h}%`,
                  background: isToday
                    ? 'linear-gradient(180deg, rgb(var(--co-accent-rgb)), rgb(var(--co-accent-rgb) / 0.5))'
                    : 'linear-gradient(180deg, rgb(var(--co-fg-rgb) / 0.4), rgb(var(--co-fg-rgb) / 0.15))',
                  boxShadow: isToday
                    ? '0 0 12px rgb(var(--co-accent-rgb) / 0.45)'
                    : 'none',
                  opacity: d.cost === 0 ? 0.3 : 1,
                }}
              />
              {/* Tooltip */}
              <div className="pointer-events-none absolute bottom-full mb-2 hidden whitespace-nowrap rounded-co-sm bg-co-fg px-2 py-1 text-[10px] font-medium text-co-bg shadow-lg group-hover:block">
                <div className="font-mono">{d.key}</div>
                <div>
                  {fmtUsd(d.cost)} · {d.runs} run{d.runs === 1 ? '' : 's'}
                </div>
              </div>
            </div>
          )
        })}
      </div>
      <div className="mt-2 flex gap-1.5">
        {days.map((d, i) => (
          <div
            key={d.key}
            className="flex-1 text-center font-mono text-[9px] text-co-fg/35"
          >
            {/* Only show every other label for legibility */}
            {i % 2 === 0 ? d.key.slice(5) : ''}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── main page ──────────────────────────────────────────────────────────────

export default function Usage() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [lastRefresh, setLastRefresh] = useState(null)

  async function load() {
    try {
      setData(await api.getUsage())
      setLastRefresh(new Date())
    } catch {}
    finally { setLoading(false) }
  }

  useEffect(() => {
    load()
    const id = setInterval(load, 15_000)
    return () => clearInterval(id)
  }, [])

  if (loading) {
    return (
      <div className="cofounder-skin min-h-full bg-co-bg">
        <div className="flex items-center gap-2 p-8 text-sm text-co-fg/45">
          <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
          </svg>
          Loading usage…
        </div>
      </div>
    )
  }

  const t = data?.totals || { cost_usd: 0, runs: 0, errors: 0, tokens: {}, duration_ms: 0 }
  const byKindEntries = Object.entries(data?.byKind || {}).sort((a, b) => b[1].cost_usd - a[1].cost_usd)
  const byModelEntries = Object.entries(data?.byModel || {}).sort((a, b) => b[1].cost_usd - a[1].cost_usd)

  // 7-day cost
  const today = new Date()
  let last7 = 0
  for (let i = 0; i < 7; i++) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    const key = d.toISOString().slice(0, 10)
    if (data?.byDate?.[key]) last7 += data.byDate[key].cost_usd
  }

  const tokensIn = (t.tokens?.input || 0)
  const tokensOut = (t.tokens?.output || 0)

  return (
    <div className="cofounder-skin relative min-h-full bg-co-bg">
      {/* Decorative orb */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 h-[420px] w-[420px] -translate-x-1/2 rounded-full opacity-[0.06] blur-3xl"
        style={{
          background:
            'radial-gradient(circle, rgb(var(--co-accent-rgb)) 0%, transparent 70%)',
        }}
      />

      <div className="relative mx-auto max-w-5xl px-8 py-10">
        {/* Header */}
        <header className="mb-8 flex items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-co-fg/40">
              <span className="h-px w-6 bg-co-fg/20" />
              Analytics
            </div>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-co-fg">Usage</h1>
            <p className="mt-1.5 text-xs text-co-fg/55">
              Cost &amp; token usage across all runs · stored in{' '}
              <code className="rounded bg-co-fg/[0.06] px-1.5 py-0.5 font-mono text-co-fg/80">
                usage.jsonl
              </code>
            </p>
          </div>
          <div className="inline-flex shrink-0 items-center gap-2 rounded-full bg-co-fg/[0.05] px-3 py-1.5 text-[11px] text-co-fg/60">
            <span className="relative inline-flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-co-success opacity-60" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-co-success" />
            </span>
            Auto-refresh
            <span className="text-co-fg/40">·</span>
            <span className="font-mono">15s</span>
          </div>
        </header>

        {/* Top stats */}
        <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard
            label="Total cost"
            primary
            value={fmtUsd(t.cost_usd)}
            sub={`${t.runs} runs · ${t.errors} error${t.errors === 1 ? '' : 's'}`}
            icon={
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="1" x2="12" y2="23" />
                <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
              </svg>
            }
          />
          <StatCard
            label="Last 7 days"
            value={fmtUsd(last7)}
            sub="rolling window"
            icon={
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
            }
          />
          <StatCard
            label="Tokens (in)"
            value={fmtTokens(tokensIn)}
            sub={`cache read ${fmtTokens(t.tokens?.cache_read)}`}
            icon={
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            }
          />
          <StatCard
            label="Tokens (out)"
            value={fmtTokens(tokensOut)}
            sub={`cache create ${fmtTokens(t.tokens?.cache_creation)}`}
            icon={
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
            }
          />
        </div>

        {/* Daily chart */}
        <div className="mb-6 overflow-hidden rounded-co-lg border border-co-fg/10 bg-co-surface p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold tracking-tight text-co-fg">
              Daily cost <span className="text-co-fg/45">· last 14 days</span>
            </h2>
            <div className="flex items-center gap-3 text-[10px] text-co-fg/50">
              <span className="inline-flex items-center gap-1.5">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{
                    background: 'rgb(var(--co-accent-rgb))',
                    boxShadow: '0 0 6px rgb(var(--co-accent-rgb) / 0.7)',
                  }}
                />
                Today
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-co-fg/30" />
                History
              </span>
            </div>
          </div>
          <ChartByDate byDate={data?.byDate || {}} />
        </div>

        <div className="mb-6 grid gap-5 md:grid-cols-2">
          <div className="rounded-co-lg border border-co-fg/10 bg-co-surface p-5">
            <h2 className="mb-4 text-sm font-semibold tracking-tight text-co-fg">By kind</h2>
            {byKindEntries.length === 0 ? (
              <div className="text-sm text-co-fg/45">No runs yet.</div>
            ) : (
              <Bar items={byKindEntries} total={t.cost_usd} />
            )}
          </div>
          <div className="rounded-co-lg border border-co-fg/10 bg-co-surface p-5">
            <h2 className="mb-4 text-sm font-semibold tracking-tight text-co-fg">By model</h2>
            {byModelEntries.length === 0 ? (
              <div className="text-sm text-co-fg/45">No runs yet.</div>
            ) : (
              <Bar items={byModelEntries} total={t.cost_usd} />
            )}
          </div>
        </div>

        {/* Recent runs */}
        <div className="overflow-hidden rounded-co-lg border border-co-fg/10 bg-co-surface">
          <div className="flex items-center justify-between border-b border-co-fg/10 px-5 py-3.5">
            <h2 className="text-sm font-semibold tracking-tight text-co-fg">Recent runs</h2>
            <span className="text-[10px] uppercase tracking-wider text-co-fg/40">
              {(data?.recent || []).length} entries
            </span>
          </div>
          {(data?.recent || []).length === 0 ? (
            <div className="px-5 py-12 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-co bg-co-fg/[0.05]">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-co-fg/40">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
              </div>
              <p className="text-sm font-medium text-co-fg/70">No runs recorded yet</p>
              <p className="mt-1 text-xs text-co-fg/45">
                Trigger a workflow, chat, or investigation to start tracking
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-co-fg/10 bg-co-bg/40 text-[10px] font-semibold uppercase tracking-[0.16em] text-co-fg/45">
                    <th className="px-5 py-2.5 text-left">When</th>
                    <th className="px-3 py-2.5 text-left">Kind</th>
                    <th className="px-3 py-2.5 text-left">Model</th>
                    <th className="px-3 py-2.5 text-right">Cost</th>
                    <th className="px-3 py-2.5 text-right">Tokens</th>
                    <th className="px-3 py-2.5 text-right">Duration</th>
                    <th className="px-5 py-2.5 text-left">Ref</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recent.map((e, i) => {
                    const color = KIND_HEX[e.kind] || '#6b7280'
                    return (
                      <tr
                        key={i}
                        className={`border-b border-co-fg/[0.06] last:border-0 transition-colors hover:bg-co-fg/[0.025] ${
                          e.is_error ? 'bg-co-destructive/[0.04]' : ''
                        }`}
                      >
                        <td className="whitespace-nowrap px-5 py-2.5 font-mono text-[11px] text-co-fg/55">
                          {new Date(e.at).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })}
                        </td>
                        <td className="px-3 py-2.5">
                          <span
                            className="inline-flex items-center gap-1.5 rounded-co-sm px-2 py-0.5 text-xs"
                            style={{
                              background: `${color}1f`,
                              color,
                            }}
                          >
                            <span
                              className="h-1.5 w-1.5 rounded-full"
                              style={{ background: color }}
                            />
                            {KIND_LABELS[e.kind] || e.kind}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 font-mono text-[11px] text-co-fg/65">{e.model || '—'}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-[11px] font-semibold text-co-fg">{fmtUsd(e.cost_usd)}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-[11px] text-co-fg/55">
                          {fmtTokens((e.tokens?.input || 0) + (e.tokens?.output || 0))}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-[11px] text-co-fg/55">{fmtDuration(e.duration_ms)}</td>
                        <td className="max-w-xs truncate px-5 py-2.5 font-mono text-[11px] text-co-fg/45" title={e.ref}>{e.ref || '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
