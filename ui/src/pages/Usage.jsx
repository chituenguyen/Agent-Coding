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

const KIND_COLORS = {
  chat: 'bg-indigo-500',
  investigate: 'bg-amber-500',
  workflow: 'bg-emerald-500',
  task: 'bg-emerald-500',
  fix: 'bg-orange-500',
  subtask: 'bg-violet-500',
  command: 'bg-sky-500',
  unknown: 'bg-gray-400',
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

function StatCard({ label, value, sub, accent }) {
  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 shadow-sm">
      <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${accent || 'text-gray-900 dark:text-white'}`}>{value}</div>
      {sub && <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{sub}</div>}
    </div>
  )
}

function Bar({ items, total }) {
  return (
    <div className="space-y-2">
      {items.map(([key, data]) => {
        const pct = total > 0 ? (data.cost_usd / total) * 100 : 0
        return (
          <div key={key}>
            <div className="flex items-center justify-between text-xs text-gray-600 dark:text-gray-300 mb-1">
              <span className="font-medium">{KIND_LABELS[key] || key}</span>
              <span className="text-gray-400 dark:text-gray-500">
                {fmtUsd(data.cost_usd)} · {data.runs} run{data.runs === 1 ? '' : 's'}
              </span>
            </div>
            <div className="h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
              <div className={`h-full ${KIND_COLORS[key] || 'bg-gray-400'} transition-all`} style={{ width: `${pct}%` }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

function ChartByDate({ byDate }) {
  const days = Object.keys(byDate).sort().slice(-14)
  if (days.length === 0) return <div className="text-sm text-gray-400 dark:text-gray-500">No data yet.</div>
  const max = Math.max(...days.map(d => byDate[d].cost_usd), 0.0001)
  return (
    <div>
      <div className="flex items-end gap-1 h-32">
        {days.map(d => {
          const cost = byDate[d].cost_usd
          const h = Math.max(2, (cost / max) * 100)
          return (
            <div key={d} className="flex-1 flex flex-col items-center justify-end group relative">
              <div
                className="w-full bg-indigo-500 hover:bg-indigo-600 dark:bg-indigo-600 rounded-t transition-colors"
                style={{ height: `${h}%` }}
              />
              <div className="absolute bottom-full mb-1 hidden group-hover:block px-2 py-1 bg-gray-900 text-white text-[10px] rounded shadow-lg whitespace-nowrap z-10">
                {d} · {fmtUsd(cost)} · {byDate[d].runs} run{byDate[d].runs === 1 ? '' : 's'}
              </div>
            </div>
          )
        })}
      </div>
      <div className="flex gap-1 mt-1">
        {days.map(d => (
          <div key={d} className="flex-1 text-center text-[10px] text-gray-400 dark:text-gray-500 font-mono truncate">
            {d.slice(5)}
          </div>
        ))}
      </div>
    </div>
  )
}

export default function Usage() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  async function load() {
    try {
      setData(await api.getUsage())
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
      <div className="p-8">
        <div className="text-sm text-gray-400 dark:text-gray-500">Loading usage...</div>
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

  return (
    <div className="p-8 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Usage</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
          Cost &amp; token usage across all runs · auto-refresh every 15s · stored in <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded text-xs">usage.jsonl</code>
        </p>
      </div>

      {/* Top stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard label="Total cost" value={fmtUsd(t.cost_usd)} sub={`${t.runs} runs · ${t.errors} errors`} accent="text-indigo-600 dark:text-indigo-400" />
        <StatCard label="Last 7 days" value={fmtUsd(last7)} sub="rolling window" />
        <StatCard label="Tokens (in)" value={fmtTokens(t.tokens?.input)} sub={`cache read ${fmtTokens(t.tokens?.cache_read)}`} />
        <StatCard label="Tokens (out)" value={fmtTokens(t.tokens?.output)} sub={`cache create ${fmtTokens(t.tokens?.cache_creation)}`} />
      </div>

      {/* Daily chart */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 shadow-sm mb-6">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Daily cost (last 14 days)</h2>
        <ChartByDate byDate={data?.byDate || {}} />
      </div>

      <div className="grid md:grid-cols-2 gap-5 mb-6">
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">By kind</h2>
          {byKindEntries.length === 0 ? (
            <div className="text-sm text-gray-400 dark:text-gray-500">No runs yet.</div>
          ) : (
            <Bar items={byKindEntries} total={t.cost_usd} />
          )}
        </div>
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">By model</h2>
          {byModelEntries.length === 0 ? (
            <div className="text-sm text-gray-400 dark:text-gray-500">No runs yet.</div>
          ) : (
            <Bar items={byModelEntries} total={t.cost_usd} />
          )}
        </div>
      </div>

      {/* Recent runs */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl shadow-sm overflow-hidden">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white px-5 py-3 border-b border-gray-100 dark:border-gray-800">Recent runs</h2>
        {(data?.recent || []).length === 0 ? (
          <div className="px-5 py-6 text-sm text-gray-400 dark:text-gray-500 text-center">
            No runs recorded yet. Trigger a workflow, chat, or investigation to start tracking.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider bg-gray-50 dark:bg-gray-950">
              <tr>
                <th className="text-left px-5 py-2 font-medium">When</th>
                <th className="text-left px-3 py-2 font-medium">Kind</th>
                <th className="text-left px-3 py-2 font-medium">Model</th>
                <th className="text-right px-3 py-2 font-medium">Cost</th>
                <th className="text-right px-3 py-2 font-medium">Tokens</th>
                <th className="text-right px-3 py-2 font-medium">Duration</th>
                <th className="text-left px-5 py-2 font-medium">Ref</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {data.recent.map((e, i) => (
                <tr key={i} className={`${e.is_error ? 'bg-red-50/50 dark:bg-red-950/20' : ''}`}>
                  <td className="px-5 py-2 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                    {new Date(e.at).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`inline-block w-2 h-2 rounded-full mr-1.5 align-middle ${KIND_COLORS[e.kind] || 'bg-gray-400'}`} />
                    <span className="text-gray-700 dark:text-gray-300">{KIND_LABELS[e.kind] || e.kind}</span>
                  </td>
                  <td className="px-3 py-2 text-gray-600 dark:text-gray-400 font-mono text-xs">{e.model || '—'}</td>
                  <td className="px-3 py-2 text-right text-gray-900 dark:text-gray-100 font-mono text-xs">{fmtUsd(e.cost_usd)}</td>
                  <td className="px-3 py-2 text-right text-gray-500 dark:text-gray-400 font-mono text-xs">
                    {fmtTokens((e.tokens?.input || 0) + (e.tokens?.output || 0))}
                  </td>
                  <td className="px-3 py-2 text-right text-gray-500 dark:text-gray-400 font-mono text-xs">{fmtDuration(e.duration_ms)}</td>
                  <td className="px-5 py-2 text-xs text-gray-500 dark:text-gray-400 truncate max-w-xs font-mono">{e.ref || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
