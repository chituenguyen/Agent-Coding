import { useEffect, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { api } from "../api";
import TeamIcon from "../components/TeamIcon";

function ReposModal({ companyId, team, onClose, onSaved }) {
  const [repos, setRepos] = useState(team.repos || []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function pickFolder() {
    try {
      const res = await api.browseFolder(`Pick source folder for ${team.name}`);
      if (res.path) {
        if (repos.includes(res.path)) return;
        setRepos((r) => [...r, res.path]);
      }
    } catch {
      // cancelled
    }
  }

  function remove(idx) {
    setRepos((r) => r.filter((_, i) => i !== idx));
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await api.updateTeam(companyId, team.id, { repos });
      onSaved();
    } catch (e) {
      setError(e.message || String(e));
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="cofounder-skin relative w-full max-w-xl overflow-hidden rounded-co-lg border border-co-fg/10 bg-co-surface shadow-2xl">
        <div
          className="h-1 w-full"
          style={{
            background: `linear-gradient(90deg, transparent, ${team.color}, transparent)`,
          }}
        />
        <div className="flex items-center justify-between gap-3 px-6 py-4">
          <div className="flex items-center gap-3">
            <div
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-co"
              style={{
                background: `linear-gradient(135deg, ${team.color}26, ${team.color}0d)`,
                boxShadow: `inset 0 0 0 1px ${team.color}33`,
              }}
            >
              <TeamIcon agent={team.agent} color={team.color} name={team.name} />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-[0.22em] text-co-fg/40">
                Source code · {team.name}
              </div>
              <h2 className="mt-0.5 text-lg font-semibold tracking-tight text-co-fg">
                Configure repos
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-co-sm text-co-fg/40 hover:bg-co-fg/[0.05] hover:text-co-fg"
          >
            ✕
          </button>
        </div>

        <div className="px-6 pb-2">
          <p className="text-xs leading-relaxed text-co-fg/60">
            Pick local folders that <span className="font-mono">@{team.agent}</span> can read & edit. These paths get passed into the agent runs scoped to this team.
          </p>

          <div className="mt-4 space-y-1.5">
            {repos.length === 0 ? (
              <div className="rounded-co border border-dashed border-co-fg/15 bg-co-bg/40 px-4 py-6 text-center text-xs text-co-fg/50">
                No repos yet. Add one below to give this team a source folder.
              </div>
            ) : (
              repos.map((p, i) => (
                <div
                  key={`${p}-${i}`}
                  className="group flex items-center gap-2 rounded-co-sm border border-co-fg/10 bg-co-bg/50 px-3 py-2"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="shrink-0 text-co-fg/40"
                  >
                    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
                  </svg>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-co-fg">
                      {p.split("/").filter(Boolean).pop()}
                    </div>
                    <div className="truncate font-mono text-[11px] text-co-fg/50">
                      {p}
                    </div>
                  </div>
                  <button
                    onClick={() => remove(i)}
                    title="Remove"
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-co-sm text-co-fg/30 transition-colors hover:bg-co-destructive/10 hover:text-co-destructive"
                  >
                    <svg
                      width="13"
                      height="13"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))
            )}
          </div>

          <button
            type="button"
            onClick={pickFolder}
            className="mt-3 inline-flex items-center gap-2 rounded-co-sm border border-dashed border-co-fg/20 bg-co-bg/30 px-3.5 py-2 text-xs font-medium text-co-fg/70 transition-colors hover:border-co-fg/40 hover:text-co-fg"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
              <path d="M12 11v6M9 14h6" />
            </svg>
            Browse folder
          </button>

          {error && (
            <div className="mt-3 rounded-co-sm border border-co-destructive/30 bg-co-destructive/[0.06] px-3 py-2 text-xs text-co-destructive">
              {error}
            </div>
          )}
        </div>

        <div className="mt-4 flex items-center justify-end gap-2 border-t border-co-fg/10 bg-co-bg/40 px-6 py-3">
          <button
            onClick={onClose}
            className="rounded-co-sm px-3 py-1.5 text-xs font-medium text-co-fg/60 hover:bg-co-fg/[0.05] hover:text-co-fg"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={busy}
            className="rounded-co-sm bg-co-primary px-4 py-1.5 text-xs font-semibold text-co-primary-fg transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

function TeamCard({ companyId, team, onConfigure }) {
  const repoCount = team.repos?.length || 0;
  return (
    <div className="group relative rounded-co-lg border border-co-fg/10 bg-co-surface p-5 transition-all hover:border-co-fg/20 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_-12px_rgba(0,0,0,0.15)]">
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onConfigure(team);
        }}
        title="Configure source repos"
        className="absolute right-3 top-3 z-10 flex h-7 w-7 items-center justify-center rounded-co-sm bg-co-bg/80 text-co-fg/50 opacity-0 ring-1 ring-co-fg/10 backdrop-blur-sm transition-all hover:bg-co-bg hover:text-co-fg group-hover:opacity-100"
      >
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>
      <Link
        to={`/co/${companyId}/team/${team.id}`}
        className="block"
      >
        <div className="flex items-start gap-3">
          <div
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-co"
            style={{
              background: `linear-gradient(135deg, ${team.color}26, ${team.color}0d)`,
              boxShadow: `inset 0 0 0 1px ${team.color}33`,
            }}
          >
            <TeamIcon agent={team.agent} color={team.color} name={team.name} />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-semibold tracking-tight text-co-fg">
              {team.name}
            </h3>
            <p className="mt-0.5 text-xs text-co-fg/60">{team.tagline}</p>
            <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[11px]">
              <span className="rounded-co-sm bg-co-fg/[0.05] px-1.5 py-0.5 font-mono text-co-fg/60">
                @{team.agent}
              </span>
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onConfigure(team);
                }}
                className={`group/repos inline-flex items-center gap-1 rounded-co-sm px-1.5 py-0.5 transition-colors ${
                  repoCount === 0
                    ? "border border-dashed border-co-fg/20 text-co-fg/50 hover:border-co-fg/40 hover:text-co-fg"
                    : "bg-co-fg/[0.05] text-co-fg/60 hover:bg-co-fg/[0.08] hover:text-co-fg"
                }`}
                title={
                  repoCount === 0
                    ? "Add a source folder"
                    : (team.repos || []).join("\n")
                }
              >
                {repoCount === 0 ? "+ add repo" : `${repoCount} repo${repoCount === 1 ? "" : "s"}`}
              </button>
            </div>
          </div>
          <span className="text-co-fg/30 transition-transform group-hover:translate-x-0.5">
            →
          </span>
        </div>
      </Link>
    </div>
  );
}

function RoomBlock({ companyId, room, onConfigureTeam }) {
  // Finance / trading-style room — single CTA, no team list.
  if (room.kind === "trading") {
    return (
      <section className="rounded-co-lg border border-co-fg/10 bg-co-surface p-6">
        <header className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-co-fg">
              {room.name}
            </h2>
            <p className="text-xs text-co-fg/60">{room.description}</p>
          </div>
          <Link
            to={room.route || "/trading"}
            className="rounded-co-sm bg-co-primary px-3 py-1.5 text-xs font-medium text-co-primary-fg transition-opacity hover:opacity-90"
          >
            Open trading desk →
          </Link>
        </header>
      </section>
    );
  }
  // Engineer-style room — render team grid + workspace tools.
  return (
    <section className="rounded-co-lg border border-co-fg/10 bg-co-surface p-6">
      <header className="mb-5 flex items-end justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-co-fg">
            {room.name}
          </h2>
          <p className="text-xs text-co-fg/60">{room.description}</p>
        </div>
        <span className="text-[11px] uppercase tracking-wider text-co-fg/40">
          {room.teams?.length || 0} teams
        </span>
      </header>
      <div className="grid gap-3 sm:grid-cols-2">
        {(room.teams || []).map((t) => (
          <TeamCard
            key={t.id}
            companyId={companyId}
            team={t}
            onConfigure={onConfigureTeam}
          />
        ))}
      </div>
      {/* Team interaction hint */}
      <div className="mt-5 rounded-co border border-dashed border-co-fg/15 bg-co-bg/50 p-3 text-xs text-co-fg/60">
        Teams can hand off to each other. Frontend can @-mention Backend in a
        chat to surface API contracts; Solution Architect orchestrates
        multi-team specs.
      </div>

      {/* Workspace tools — Tasks, Investigate, Queue scoped to engineering */}
      <div className="mt-5 border-t border-co-fg/10 pt-4">
        <div className="mb-2 text-[10px] uppercase tracking-[0.18em] text-co-fg/40">
          Workspace tools
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Link
            to={`/co/${companyId}/tasks`}
            className="group rounded-co border border-co-fg/10 bg-co-bg/40 px-3 py-2.5 transition-colors hover:border-co-fg/20 hover:bg-co-bg/70"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-co-fg">Tasks</span>
              <span className="text-co-fg/30 transition-transform group-hover:translate-x-0.5">
                →
              </span>
            </div>
            <div className="mt-0.5 text-[11px] text-co-fg/50">
              Multi-agent workflow runs
            </div>
          </Link>
          <Link
            to={`/co/${companyId}/investigate`}
            className="group rounded-co border border-co-fg/10 bg-co-bg/40 px-3 py-2.5 transition-colors hover:border-co-fg/20 hover:bg-co-bg/70"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-co-fg">
                Investigate
              </span>
              <span className="text-co-fg/30 transition-transform group-hover:translate-x-0.5">
                →
              </span>
            </div>
            <div className="mt-0.5 text-[11px] text-co-fg/50">
              Root-cause a bug interactively
            </div>
          </Link>
          <Link
            to={`/co/${companyId}/queue`}
            className="group rounded-co border border-co-fg/10 bg-co-bg/40 px-3 py-2.5 transition-colors hover:border-co-fg/20 hover:bg-co-bg/70"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-co-fg">Queue</span>
              <span className="text-co-fg/30 transition-transform group-hover:translate-x-0.5">
                →
              </span>
            </div>
            <div className="mt-0.5 text-[11px] text-co-fg/50">
              Batch task runner
            </div>
          </Link>
        </div>
      </div>
    </section>
  );
}

export default function Company() {
  const { companyId } = useParams();
  const navigate = useNavigate();
  const [company, setCompany] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [configuringTeam, setConfiguringTeam] = useState(null);

  async function refresh() {
    try {
      const c = await api.getCompany(companyId);
      setCompany(c);
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => {
    setLoading(true);
    refresh().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  const accent = company?.accent || "#888";
  return (
    <div className="cofounder-skin relative min-h-screen overflow-hidden bg-co-bg">
      {company && (
        <div
          aria-hidden
          className="pointer-events-none absolute -top-32 right-[-10%] h-[420px] w-[420px] rounded-full opacity-[0.10] blur-3xl"
          style={{ background: accent }}
        />
      )}
      <div className="relative mx-auto max-w-4xl px-8 py-10">
        <button
          onClick={() => navigate("/")}
          className="group mb-6 inline-flex items-center gap-1.5 text-xs text-co-fg/50 transition-colors hover:text-co-fg"
        >
          <span className="transition-transform group-hover:-translate-x-0.5">
            ←
          </span>
          Companies
        </button>
        {loading ? (
          <div className="text-sm text-co-fg/50">Loading…</div>
        ) : error ? (
          <div className="rounded-co border border-co-destructive/30 bg-co-destructive/[0.05] p-4 text-sm text-co-destructive">
            {error}
          </div>
        ) : !company ? (
          <div className="text-sm text-co-fg/50">Not found.</div>
        ) : (
          <>
            <header className="mb-10 flex items-center gap-5">
              {company.logo ? (
                <div
                  className="relative h-16 w-16 shrink-0 overflow-hidden rounded-co-lg bg-co-bg ring-1 ring-co-fg/[0.08]"
                  style={{
                    boxShadow: `0 12px 32px -16px ${accent}66`,
                  }}
                >
                  <img
                    src={company.logo}
                    alt={company.name}
                    className="h-full w-full object-cover"
                    draggable={false}
                  />
                </div>
              ) : (
                <div
                  className="flex h-16 w-16 shrink-0 items-center justify-center rounded-co-lg text-2xl font-semibold tracking-tight ring-1 ring-co-fg/[0.06]"
                  style={{
                    background: `linear-gradient(135deg, ${accent}33, ${accent}14)`,
                    color: accent,
                  }}
                >
                  {company.name?.[0]?.toUpperCase()}
                </div>
              )}
              <div>
                <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-co-fg/40">
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: accent }}
                  />
                  Company
                </div>
                <h1 className="mt-1 text-3xl font-semibold tracking-tight text-co-fg">
                  {company.name}
                </h1>
                <p className="mt-1 text-sm text-co-fg/60">{company.tagline}</p>
              </div>
            </header>

            <div className="space-y-6">
              {(company.rooms || []).map((r) => (
                <RoomBlock
                  key={r.id}
                  companyId={company.id}
                  room={r}
                  onConfigureTeam={setConfiguringTeam}
                />
              ))}
            </div>

            {configuringTeam && (
              <ReposModal
                companyId={company.id}
                team={configuringTeam}
                onClose={() => setConfiguringTeam(null)}
                onSaved={() => {
                  setConfiguringTeam(null);
                  refresh();
                }}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
