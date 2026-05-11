import { useEffect, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { api } from "../api";

function TeamCard({ companyId, team }) {
  const repoCount = team.repos?.length || 0;
  return (
    <Link
      to={`/co/${companyId}/team/${team.id}`}
      className="group relative block rounded-co-lg border border-co-fg/10 bg-co-surface p-5 transition-all hover:border-co-fg/20 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_-12px_rgba(0,0,0,0.15)]"
    >
      <div className="flex items-start gap-3">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-co text-lg"
          style={{ backgroundColor: `${team.color}1f`, color: team.color }}
        >
          {team.icon || team.name?.[0]}
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
            <span className="rounded-co-sm bg-co-fg/[0.05] px-1.5 py-0.5 text-co-fg/60">
              {repoCount} repo{repoCount === 1 ? "" : "s"}
            </span>
          </div>
        </div>
        <span className="text-co-fg/30 transition-transform group-hover:translate-x-0.5">
          →
        </span>
      </div>
    </Link>
  );
}

function RoomBlock({ companyId, room }) {
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
          <TeamCard key={t.id} companyId={companyId} team={t} />
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

  useEffect(() => {
    setLoading(true);
    api
      .getCompany(companyId)
      .then(setCompany)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [companyId]);

  return (
    <div className="cofounder-skin min-h-screen bg-co-bg">
      <div className="mx-auto max-w-4xl px-8 py-10">
        <button
          onClick={() => navigate("/")}
          className="mb-6 inline-flex items-center gap-1 text-xs text-co-fg/50 hover:text-co-fg"
        >
          ← Companies
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
            <header className="mb-8 flex items-center gap-3">
              <div
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: company.accent }}
              />
              <div>
                <div className="text-[11px] uppercase tracking-[0.18em] text-co-fg/40">
                  Company
                </div>
                <h1 className="mt-0.5 text-3xl font-semibold tracking-tight text-co-fg">
                  {company.name}
                </h1>
                <p className="mt-1 text-sm text-co-fg/60">{company.tagline}</p>
              </div>
            </header>

            <div className="space-y-6">
              {(company.rooms || []).map((r) => (
                <RoomBlock key={r.id} companyId={company.id} room={r} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
