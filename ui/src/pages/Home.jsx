import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";

function CompanyCard({ company }) {
  const room = company.rooms?.[0];
  const teamCount = (company.rooms || []).reduce(
    (a, r) => a + (r.teams?.length || 0),
    0,
  );
  return (
    <Link
      to={`/co/${company.id}`}
      className="group relative block rounded-co-lg border border-co-fg/10 bg-co-surface p-6 transition-all hover:border-co-fg/20 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_-12px_rgba(0,0,0,0.15)]"
    >
      <div
        className="absolute left-6 top-6 h-2 w-2 rounded-full"
        style={{ backgroundColor: company.accent }}
      />
      <div className="ml-5">
        <h2 className="text-xl font-semibold text-co-fg tracking-tight">
          {company.name}
        </h2>
        <p className="mt-1 text-sm text-co-fg/60">{company.tagline}</p>
        <div className="mt-5 flex flex-wrap gap-2">
          {(company.rooms || []).map((r) => (
            <span
              key={r.id}
              className="inline-flex items-center gap-1.5 rounded-co-sm bg-co-fg/[0.05] px-2 py-1 text-[11px] font-medium text-co-fg/70"
            >
              <span className="opacity-70">·</span>
              {r.name}
              {r.teams?.length ? (
                <span className="text-co-fg/40">({r.teams.length})</span>
              ) : null}
            </span>
          ))}
        </div>
        {teamCount > 0 && (
          <div className="mt-4 text-[11px] uppercase tracking-wider text-co-fg/40">
            {teamCount} team{teamCount === 1 ? "" : "s"} ·{" "}
            {company.rooms.length} room{company.rooms.length === 1 ? "" : "s"}
          </div>
        )}
      </div>
      <div className="absolute right-5 top-6 text-co-fg/30 transition-transform group-hover:translate-x-0.5">
        →
      </div>
    </Link>
  );
}

export default function Home() {
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .getCompanies()
      .then((d) => setCompanies(d.companies || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="cofounder-skin min-h-screen bg-co-bg">
      <div className="mx-auto max-w-4xl px-8 py-12">
        <header className="mb-10">
          <div className="text-[11px] uppercase tracking-[0.18em] text-co-fg/40">
            Workspace
          </div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-co-fg">
            Companies
          </h1>
          <p className="mt-2 max-w-xl text-sm text-co-fg/60">
            Pick a company to drop into its rooms — engineering, finance,
            design. Each room exposes the agents and teams that work in that
            domain.
          </p>
        </header>

        {loading ? (
          <div className="text-sm text-co-fg/50">Loading companies…</div>
        ) : companies.length === 0 ? (
          <div className="rounded-co border border-dashed border-co-fg/20 p-8 text-center text-sm text-co-fg/60">
            No companies configured. Edit{" "}
            <code className="rounded bg-co-fg/[0.05] px-1.5 py-0.5 font-mono text-co-fg">
              companies.json
            </code>{" "}
            at the workspace root.
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {companies.map((c) => (
              <CompanyCard key={c.id} company={c} />
            ))}
          </div>
        )}

        <div className="mt-12 border-t border-co-fg/10 pt-6">
          <div className="text-[11px] uppercase tracking-[0.18em] text-co-fg/40">
            Common
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              to="/chat"
              className="rounded-co-sm border border-co-fg/15 px-3 py-1.5 text-xs font-medium text-co-fg/70 transition-colors hover:border-co-fg/30 hover:text-co-fg"
            >
              Ask any team
            </Link>
            <span className="text-xs text-co-fg/40 self-center">
              · everything else lives inside a company
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
