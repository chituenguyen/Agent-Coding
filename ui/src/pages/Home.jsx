import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";

function CompanyLogo({ company, size = 56 }) {
  if (company.logo) {
    return (
      <div
        className="relative shrink-0 overflow-hidden rounded-co bg-co-bg ring-1 ring-co-fg/[0.08]"
        style={{ width: size, height: size }}
      >
        <img
          src={company.logo}
          alt={company.name}
          className="h-full w-full object-cover"
          draggable={false}
        />
      </div>
    );
  }
  const accent = company.accent || "#9ca3af";
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-co font-semibold tracking-tight ring-1 ring-co-fg/[0.06]"
      style={{
        width: size,
        height: size,
        background: `linear-gradient(135deg, ${accent}33, ${accent}14)`,
        color: accent,
        fontSize: Math.round(size * 0.42),
      }}
    >
      {company.name?.[0]?.toUpperCase() || "?"}
    </div>
  );
}

function CompanyCard({ company, onEdit, onDelete }) {
  const teamCount = (company.rooms || []).reduce(
    (a, r) => a + (r.teams?.length || 0),
    0,
  );
  const accent = company.accent || "#888";
  return (
    <div
      className="group relative overflow-hidden rounded-co-lg border border-co-fg/10 bg-co-surface transition-all duration-300 hover:-translate-y-0.5 hover:border-co-fg/20"
      style={{ "--accent": accent }}
    >
      {/* Accent glow blob — appears on hover */}
      <div
        className="pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-40"
        style={{ background: accent }}
      />
      {/* Top accent stripe */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-px opacity-50"
        style={{
          background: `linear-gradient(90deg, transparent, ${accent}, transparent)`,
        }}
      />

      {/* Edit/Delete actions — hover-revealed */}
      <div className="absolute right-3 top-3 z-10 flex items-center gap-1 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onEdit(company);
          }}
          title="Edit workspace"
          className="flex h-7 w-7 items-center justify-center rounded-co-sm bg-co-bg/80 text-co-fg/60 ring-1 ring-co-fg/10 backdrop-blur-sm transition-colors hover:bg-co-bg hover:text-co-fg"
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
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
          </svg>
        </button>
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onDelete(company);
          }}
          title="Delete workspace"
          className="flex h-7 w-7 items-center justify-center rounded-co-sm bg-co-bg/80 text-co-fg/60 ring-1 ring-co-fg/10 backdrop-blur-sm transition-colors hover:bg-co-destructive/10 hover:text-co-destructive"
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
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
            <path d="M10 11v6M14 11v6" />
            <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
          </svg>
        </button>
      </div>

      <Link to={`/co/${company.id}`} className="relative block p-6">
        <div className="flex items-start gap-4">
          <CompanyLogo company={company} size={56} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <div className="text-[10px] uppercase tracking-[0.18em] text-co-fg/40">
                Company
              </div>
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: accent }}
              />
            </div>
            <h2 className="mt-0.5 text-xl font-semibold tracking-tight text-co-fg">
              {company.name}
            </h2>
            <p className="mt-1 text-sm text-co-fg/60">{company.tagline}</p>
          </div>
          <div
            className="flex h-7 w-7 items-center justify-center rounded-full text-co-fg/40 transition-all duration-300 group-hover:translate-x-0.5 group-hover:bg-co-fg/[0.05] group-hover:text-co-fg/70"
            aria-hidden
          >
            →
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-1.5">
          {(company.rooms || []).map((r) => (
            <span
              key={r.id}
              className="inline-flex items-center gap-1.5 rounded-co-sm bg-co-fg/[0.04] px-2 py-1 text-[11px] font-medium text-co-fg/70 ring-1 ring-inset ring-co-fg/[0.04]"
            >
              <span
                className="h-1 w-1 rounded-full"
                style={{ backgroundColor: accent, opacity: 0.7 }}
              />
              {r.name}
              {r.teams?.length ? (
                <span className="text-co-fg/40">({r.teams.length})</span>
              ) : null}
            </span>
          ))}
        </div>

        {teamCount > 0 && (
          <div className="mt-4 flex items-center gap-3 text-[11px] uppercase tracking-[0.16em] text-co-fg/40">
            <span>
              {teamCount} team{teamCount === 1 ? "" : "s"}
            </span>
            <span className="h-px flex-1 bg-co-fg/[0.08]" />
            <span>
              {company.rooms.length} room{company.rooms.length === 1 ? "" : "s"}
            </span>
          </div>
        )}
      </Link>
    </div>
  );
}

const PRESET_ACCENTS = [
  "#1d3df0",
  "#10b981",
  "#a5bd39",
  "#ef4444",
  "#f59e0b",
  "#8b5cf6",
  "#ec4899",
  "#0ea5e9",
];

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

function WorkspaceModal({ mode, initial, onClose, onSaved }) {
  const isEdit = mode === "edit";
  const [name, setName] = useState(initial?.name || "");
  const [tagline, setTagline] = useState(initial?.tagline || "");
  const [accent, setAccent] = useState(initial?.accent || PRESET_ACCENTS[0]);
  const [logoUrl, setLogoUrl] = useState(initial?.logo || "");
  const [logoDataUrl, setLogoDataUrl] = useState(null);
  const [logoFilename, setLogoFilename] = useState(null);
  const [repoPath, setRepoPath] = useState("");
  const [initFolder, setInitFolder] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const fileRef = useRef(null);

  async function pickFolder() {
    try {
      const res = await api.browseFolder("Select workspace folder");
      if (res.path) setRepoPath(res.path);
    } catch {
      // cancelled
    }
  }

  const [dragging, setDragging] = useState(false);

  async function handleFile(f) {
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      setError("Logo must be an image (PNG, JPG, SVG, WebP)");
      return;
    }
    if (f.size > 5 * 1024 * 1024) {
      setError("Logo too large (max 5 MB)");
      return;
    }
    const dataUrl = await fileToDataUrl(f);
    setLogoDataUrl(dataUrl);
    setLogoFilename(f.name);
    setLogoUrl("");
    setError(null);
  }

  async function pickLogo(e) {
    await handleFile(e.target.files?.[0]);
  }

  function onLogoDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
    handleFile(e.dataTransfer.files?.[0]);
  }

  async function submit(e) {
    e?.preventDefault?.();
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const logoPayload = logoDataUrl
        ? { dataUrl: logoDataUrl, filename: logoFilename }
        : logoUrl || null;
      if (isEdit) {
        const patch = {
          name: name.trim(),
          tagline: tagline.trim(),
          accent,
        };
        // Only send logo if it changed
        if (logoDataUrl) patch.logo = logoPayload;
        else if (logoUrl !== (initial?.logo || "")) patch.logo = logoUrl || null;
        await api.updateCompany(initial.id, patch);
      } else {
        await api.createCompany({
          name: name.trim(),
          tagline: tagline.trim(),
          accent,
          logo: logoPayload,
          repoPath: repoPath.trim(),
          init: initFolder,
        });
      }
      onSaved();
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setBusy(false);
    }
  }

  const previewSrc = logoDataUrl || logoUrl || null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-sm"
        onClick={onClose}
      />
      <form
        onSubmit={submit}
        className="cofounder-skin relative w-full max-w-lg overflow-hidden rounded-co-lg border border-co-fg/10 bg-co-surface shadow-2xl"
      >
        {/* Accent stripe */}
        <div
          className="h-1 w-full"
          style={{
            background: `linear-gradient(90deg, transparent, ${accent}, transparent)`,
          }}
        />
        <div className="flex items-center justify-between px-6 py-4">
          <div>
            <div className="text-[10px] uppercase tracking-[0.22em] text-co-fg/40">
              Workspace
            </div>
            <h2 className="mt-0.5 text-lg font-semibold tracking-tight text-co-fg">
              {isEdit ? `Edit ${initial?.name}` : "New workspace"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-co-sm text-co-fg/40 hover:bg-co-fg/[0.05] hover:text-co-fg"
          >
            ✕
          </button>
        </div>

        <div className="space-y-4 px-6 pb-2">
          {/* Logo + name row */}
          <div className="flex items-start gap-4">
            <div className="flex flex-col items-center gap-1.5">
              <div
                role="button"
                tabIndex={0}
                onClick={() => fileRef.current?.click()}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    fileRef.current?.click();
                  }
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={onLogoDrop}
                title="Click or drop image to upload"
                className={`group/logo relative flex h-20 w-20 cursor-pointer items-center justify-center overflow-hidden rounded-co-lg transition-all ${
                  dragging
                    ? "ring-2 ring-offset-2 ring-offset-co-surface"
                    : ""
                }`}
                style={{
                  background: previewSrc
                    ? "transparent"
                    : `linear-gradient(135deg, ${accent}33, ${accent}10)`,
                  boxShadow: previewSrc
                    ? `inset 0 0 0 1px ${accent}33`
                    : `inset 0 0 0 1px ${accent}33`,
                  outline: dragging ? `2px dashed ${accent}` : "none",
                  outlineOffset: dragging ? "4px" : "0",
                }}
              >
                {previewSrc ? (
                  <img
                    src={previewSrc}
                    alt="logo"
                    className="h-full w-full object-cover"
                    draggable={false}
                  />
                ) : (
                  <div
                    className="text-2xl font-semibold"
                    style={{ color: accent }}
                  >
                    {name?.[0]?.toUpperCase() || "?"}
                  </div>
                )}
                {/* Hover overlay with upload icon */}
                <div className="absolute inset-0 flex items-center justify-center bg-black/55 opacity-0 transition-opacity group-hover/logo:opacity-100">
                  <div className="flex flex-col items-center gap-1 text-white">
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="17 8 12 3 7 8" />
                      <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                    <span className="text-[10px] font-semibold uppercase tracking-wider">
                      {previewSrc ? "Change" : "Upload"}
                    </span>
                  </div>
                </div>
              </div>
              {previewSrc && (
                <button
                  type="button"
                  onClick={() => {
                    setLogoDataUrl(null);
                    setLogoUrl("");
                    setLogoFilename(null);
                  }}
                  className="text-[10px] uppercase tracking-wider text-co-fg/40 hover:text-co-destructive"
                >
                  Remove
                </button>
              )}
              {!previewSrc && (
                <span className="text-[10px] uppercase tracking-wider text-co-fg/40">
                  Click or drop
                </span>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/svg+xml,image/webp"
                onChange={pickLogo}
                className="hidden"
              />
            </div>
            <div className="flex-1 space-y-3">
              <div>
                <label className="text-[10px] uppercase tracking-wider text-co-fg/40">
                  Name
                </label>
                <input
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Acme Inc."
                  className="mt-1 w-full rounded-co-sm border border-co-fg/15 bg-co-bg px-3 py-2 text-sm text-co-fg outline-none focus:border-co-fg/40"
                />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider text-co-fg/40">
                  Tagline
                </label>
                <input
                  value={tagline}
                  onChange={(e) => setTagline(e.target.value)}
                  placeholder="Product engineering"
                  className="mt-1 w-full rounded-co-sm border border-co-fg/15 bg-co-bg px-3 py-2 text-sm text-co-fg outline-none focus:border-co-fg/40"
                />
              </div>
            </div>
          </div>

          {/* Accent picker */}
          <div>
            <label className="text-[10px] uppercase tracking-wider text-co-fg/40">
              Accent
            </label>
            <div className="mt-2 flex items-center gap-2">
              {PRESET_ACCENTS.map((c) => (
                <button
                  type="button"
                  key={c}
                  onClick={() => setAccent(c)}
                  className={`h-6 w-6 rounded-full transition-transform ${
                    accent === c ? "scale-110 ring-2 ring-co-fg/40" : ""
                  }`}
                  style={{ backgroundColor: c }}
                  title={c}
                />
              ))}
              <input
                type="color"
                value={accent}
                onChange={(e) => setAccent(e.target.value)}
                className="h-6 w-8 cursor-pointer rounded border-0 bg-transparent p-0"
                title="Custom"
              />
            </div>
          </div>

          {/* Workspace path — create only */}
          {!isEdit && (
            <div>
              <label className="text-[10px] uppercase tracking-wider text-co-fg/40">
                Workspace folder
              </label>
              <div className="mt-1 flex gap-2">
                <input
                  value={repoPath}
                  onChange={(e) => setRepoPath(e.target.value)}
                  placeholder="/Users/you/projects/my-app"
                  className="flex-1 rounded-co-sm border border-co-fg/15 bg-co-bg px-3 py-2 font-mono text-xs text-co-fg outline-none focus:border-co-fg/40"
                />
                <button
                  type="button"
                  onClick={pickFolder}
                  className="rounded-co-sm border border-co-fg/15 bg-co-surface px-3 py-2 text-xs font-medium text-co-fg/70 hover:border-co-fg/30 hover:text-co-fg"
                >
                  Browse
                </button>
              </div>
              <label className="mt-2 flex items-center gap-2 text-xs text-co-fg/60">
                <input
                  type="checkbox"
                  checked={initFolder}
                  onChange={(e) => setInitFolder(e.target.checked)}
                  className="h-3.5 w-3.5"
                />
                Create folder if it doesn't exist
              </label>
              <p className="mt-2 text-[11px] text-co-fg/40">
                Engineer Room with FE / BE / DevOps / Architect will be wired to
                this path. You can split repos per-team later in{" "}
                <code className="rounded bg-co-fg/[0.05] px-1 py-0.5 font-mono">
                  companies.json
                </code>
                .
              </p>
            </div>
          )}

          {error && (
            <div className="rounded-co-sm border border-co-destructive/30 bg-co-destructive/[0.06] px-3 py-2 text-xs text-co-destructive">
              {error}
            </div>
          )}
        </div>

        <div className="mt-4 flex items-center justify-end gap-2 border-t border-co-fg/10 bg-co-bg/40 px-6 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-co-sm px-3 py-1.5 text-xs font-medium text-co-fg/60 hover:bg-co-fg/[0.05] hover:text-co-fg"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            className="rounded-co-sm bg-co-primary px-4 py-1.5 text-xs font-semibold text-co-primary-fg transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Saving…" : isEdit ? "Save changes" : "Create workspace"}
          </button>
        </div>
      </form>
    </div>
  );
}

function ConfirmDelete({ company, onClose, onConfirmed }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function go() {
    setBusy(true);
    setError(null);
    try {
      await api.deleteCompany(company.id);
      onConfirmed();
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
      <div className="cofounder-skin relative w-full max-w-sm overflow-hidden rounded-co-lg border border-co-fg/10 bg-co-surface shadow-2xl">
        <div className="px-6 py-5">
          <h3 className="text-base font-semibold tracking-tight text-co-fg">
            Delete {company.name}?
          </h3>
          <p className="mt-2 text-xs leading-relaxed text-co-fg/60">
            Removes the company from the workspace picker. Your local code at
            the picked path is{" "}
            <span className="font-semibold text-co-fg">not</span> touched.
          </p>
          {error && (
            <div className="mt-3 rounded-co-sm border border-co-destructive/30 bg-co-destructive/[0.06] px-3 py-2 text-xs text-co-destructive">
              {error}
            </div>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-co-fg/10 bg-co-bg/40 px-6 py-3">
          <button
            onClick={onClose}
            className="rounded-co-sm px-3 py-1.5 text-xs font-medium text-co-fg/60 hover:bg-co-fg/[0.05] hover:text-co-fg"
          >
            Cancel
          </button>
          <button
            onClick={go}
            disabled={busy}
            className="rounded-co-sm bg-co-destructive px-4 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // { mode: 'create' | 'edit', company? }
  const [deleting, setDeleting] = useState(null);

  async function refresh() {
    try {
      const d = await api.getCompanies();
      setCompanies(d.companies || []);
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, []);

  return (
    <div className="cofounder-skin relative min-h-screen overflow-hidden bg-co-bg">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 h-[480px] w-[480px] -translate-x-1/2 rounded-full opacity-[0.07] blur-3xl"
        style={{
          background:
            "radial-gradient(circle, rgb(var(--co-accent-rgb)) 0%, transparent 70%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.025]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, rgb(var(--co-fg-rgb)) 1px, transparent 0)",
          backgroundSize: "24px 24px",
        }}
      />

      <div className="relative mx-auto max-w-5xl px-8 py-14">
        <header className="mb-12 flex items-end justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-co-fg/40">
              <span className="h-px w-6 bg-co-fg/20" />
              Workspace
            </div>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight text-co-fg">
              Companies
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-co-fg/60">
              Pick a company to drop into its rooms — engineering, finance,
              design. Each room exposes the agents and teams that work in that
              domain.
            </p>
          </div>
          <button
            onClick={() => setModal({ mode: "create" })}
            className="group inline-flex shrink-0 items-center gap-2 rounded-co-sm bg-co-primary px-3.5 py-2 text-xs font-semibold text-co-primary-fg transition-all hover:opacity-90"
          >
            <span className="text-base leading-none">+</span>
            New workspace
          </button>
        </header>

        {loading ? (
          <div className="text-sm text-co-fg/50">Loading companies…</div>
        ) : companies.length === 0 ? (
          <div className="rounded-co border border-dashed border-co-fg/20 p-8 text-center text-sm text-co-fg/60">
            No companies yet. Click{" "}
            <button
              onClick={() => setModal({ mode: "create" })}
              className="font-semibold text-co-fg underline-offset-2 hover:underline"
            >
              New workspace
            </button>{" "}
            to add one.
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {companies.map((c) => (
              <CompanyCard
                key={c.id}
                company={c}
                onEdit={(co) => setModal({ mode: "edit", company: co })}
                onDelete={(co) => setDeleting(co)}
              />
            ))}
          </div>
        )}

        <div className="mt-14 border-t border-co-fg/10 pt-6">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-co-fg/40">
            <span className="h-px w-6 bg-co-fg/20" />
            Common
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Link
              to="/chat"
              className="group inline-flex items-center gap-2 rounded-co-sm border border-co-fg/15 bg-co-surface px-3.5 py-2 text-xs font-medium text-co-fg/70 transition-all hover:border-co-fg/30 hover:text-co-fg"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-co-fg/40 transition-colors group-hover:bg-co-fg/70" />
              Ask any team
            </Link>
            <span className="text-xs text-co-fg/40">
              · everything else lives inside a company
            </span>
          </div>
        </div>
      </div>

      {modal && (
        <WorkspaceModal
          mode={modal.mode}
          initial={modal.company}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            refresh();
          }}
        />
      )}
      {deleting && (
        <ConfirmDelete
          company={deleting}
          onClose={() => setDeleting(null)}
          onConfirmed={() => {
            setDeleting(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}
