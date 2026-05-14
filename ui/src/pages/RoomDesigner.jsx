import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api";

const PRESET_COLORS = [
  "#3b82f6",
  "#10b981",
  "#f97316",
  "#8b5cf6",
  "#eab308",
  "#14b8a6",
  "#ef4444",
  "#ec4899",
  "#6366f1",
  "#06b6d4",
];

const SAFE_TOOLS = ["Read", "Grep", "Glob", "WebFetch", "WebSearch"];
const DANGEROUS_TOOLS = ["Edit", "Write", "Bash", "Task", "NotebookEdit"];

export default function RoomDesigner() {
  const { companyId } = useParams();
  const navigate = useNavigate();
  const [company, setCompany] = useState(null);
  const [description, setDescription] = useState("");
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState(null);
  const [draft, setDraft] = useState(null);
  const [regenTarget, setRegenTarget] = useState(null);
  const [staleTeams, setStaleTeams] = useState([]);
  const [staleChecking, setStaleChecking] = useState(false);
  const [turns, setTurns] = useState([]);
  const [saving, setSaving] = useState(false);
  const [models, setModels] = useState([]);

  useEffect(() => {
    api
      .getCompany(companyId)
      .then(setCompany)
      .catch((e) => setError(e.message));
    api
      .getModels()
      .then((list) => setModels(list.map((m) => m.id)))
      .catch(() => setModels([]));
  }, [companyId]);

  async function handleGenerate() {
    if (!description.trim()) return;
    setGenerating(true);
    setProgress("");
    setError(null);
    setStaleTeams([]);
    try {
      const result = await api.startRoomDesign(
        companyId,
        description.trim(),
        (chunk) => setProgress((p) => p + chunk),
      );
      const room = result.room || result;
      setDraft({
        name: room.name || "",
        description: room.description || "",
        teams: (room.teams || []).map((t, i) => ({
          ...t,
          id: t.id || slugify(t.name) || `team-${i}`,
          color: t.color || PRESET_COLORS[i % PRESET_COLORS.length],
        })),
      });
      setTurns((t) => [
        ...t,
        { role: "user", text: description.trim() },
        {
          role: "assistant",
          text: `Drafted ${room.teams?.length || 0} teams.`,
        },
      ]);
      setDescription("");
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setGenerating(false);
      setProgress("");
    }
  }

  function updateTeam(idx, patch) {
    setDraft((d) => {
      const teams = d.teams.slice();
      teams[idx] = { ...teams[idx], ...patch };
      return { ...d, teams };
    });
  }

  function updateAgentDef(idx, patch) {
    setDraft((d) => {
      const teams = d.teams.slice();
      const cur = teams[idx];
      teams[idx] = {
        ...cur,
        agentDef: { ...(cur.agentDef || {}), ...patch },
      };
      return { ...d, teams };
    });
  }

  function removeTeam(idx) {
    setDraft((d) => ({ ...d, teams: d.teams.filter((_, i) => i !== idx) }));
  }

  async function handleRegen(teamId, instructions) {
    setRegenTarget({ teamId, busy: true });
    try {
      const result = await api.regenRoomAgent(
        companyId,
        draft,
        teamId,
        instructions,
      );
      setDraft((d) => ({
        ...d,
        teams: d.teams.map((t) =>
          t.id === teamId ? { ...t, agentDef: result.agentDef } : t,
        ),
      }));
      setStaleTeams((s) => s.filter((x) => x.teamId !== teamId));
      setRegenTarget(null);
    } catch (e) {
      setRegenTarget({ teamId, busy: false, error: e.message });
    }
  }

  async function handleCheckStale(editedTeamId) {
    setStaleChecking(true);
    try {
      const result = await api.checkStaleRoomAgents(
        companyId,
        draft,
        editedTeamId,
        null,
      );
      setStaleTeams(
        (result.staleTeams || []).filter((s) => s.teamId !== editedTeamId),
      );
    } catch {
      // silent — stale-check is best-effort
    } finally {
      setStaleChecking(false);
    }
  }

  async function handleSave() {
    if (!draft) return;
    setSaving(true);
    setError(null);
    try {
      // Validate: any team with dangerous tools must have tools_acknowledged
      for (const t of draft.teams) {
        if (!t.agentDef) continue;
        const dangerous = (t.agentDef.tools || []).filter((x) =>
          DANGEROUS_TOOLS.includes(x),
        );
        if (dangerous.length && !t.agentDef.tools_acknowledged) {
          throw new Error(
            `Team "${t.name}": acknowledge dangerous tools (${dangerous.join(", ")}) before saving`,
          );
        }
      }
      await api.finalizeRoom(companyId, {
        name: draft.name,
        description: draft.description,
        teams: draft.teams,
      });
      navigate(`/co/${companyId}`);
    } catch (e) {
      setError(e.message || String(e));
      setSaving(false);
    }
  }

  return (
    <div className="cofounder-skin min-h-screen bg-co-bg">
      <div className="mx-auto max-w-7xl px-8 py-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <button
              onClick={() => navigate(`/co/${companyId}`)}
              className="group mb-2 inline-flex items-center gap-1.5 text-xs text-co-fg/50 transition-colors hover:text-co-fg"
            >
              <span className="transition-transform group-hover:-translate-x-0.5">
                ←
              </span>
              Back to {company?.name || "company"}
            </button>
            <h1 className="text-2xl font-semibold tracking-tight text-co-fg">
              Design a room
            </h1>
            <p className="mt-1 text-sm text-co-fg/60">
              Describe what the room is for. The designer drafts 3–6 teammates
              you can edit before saving.
            </p>
          </div>
          {draft && (
            <button
              onClick={handleSave}
              disabled={saving}
              className="rounded-co bg-co-fg px-4 py-2 text-sm font-medium text-co-bg disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save room"}
            </button>
          )}
        </div>

        {error && (
          <div className="mb-4 rounded-co border border-co-destructive/30 bg-co-destructive/[0.05] p-3 text-sm text-co-destructive">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[380px_1fr]">
          <ChatPanel
            description={description}
            setDescription={setDescription}
            generating={generating}
            progress={progress}
            turns={turns}
            onGenerate={handleGenerate}
            hasDraft={!!draft}
          />

          <div className="space-y-4">
            {!draft && !generating && (
              <div className="rounded-co-lg border border-dashed border-co-fg/15 bg-co-surface/40 p-10 text-center text-sm text-co-fg/50">
                Cards will appear here after the designer generates a draft.
              </div>
            )}
            {generating && (
              <div className="rounded-co-lg border border-co-fg/10 bg-co-surface p-6 text-sm text-co-fg/70">
                <div className="mb-2 font-medium text-co-fg">Designing…</div>
                <div className="max-h-48 overflow-auto whitespace-pre-wrap font-mono text-[11px] text-co-fg/50">
                  {progress || "Waiting for the agent…"}
                </div>
              </div>
            )}
            {draft && (
              <>
                <RoomMeta draft={draft} setDraft={setDraft} />
                {staleTeams.length > 0 && (
                  <StaleBanner
                    staleTeams={staleTeams}
                    teams={draft.teams}
                    onRegen={(teamId) => setRegenTarget({ teamId })}
                    onDismiss={(teamId) =>
                      setStaleTeams((s) => s.filter((x) => x.teamId !== teamId))
                    }
                  />
                )}
                {staleChecking && (
                  <div className="text-xs text-co-fg/50">
                    Checking other teammates for staleness…
                  </div>
                )}
                <div className="space-y-3">
                  {draft.teams.map((team, idx) => (
                    <TeamCard
                      key={team.id}
                      team={team}
                      onChange={(patch) => updateTeam(idx, patch)}
                      onChangeAgentDef={(patch) => updateAgentDef(idx, patch)}
                      onRegen={() => setRegenTarget({ teamId: team.id })}
                      onRemove={() => removeTeam(idx)}
                      onEdited={() => handleCheckStale(team.id)}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {regenTarget && (
        <RegenModal
          target={regenTarget}
          teams={draft?.teams || []}
          onClose={() => setRegenTarget(null)}
          onSubmit={handleRegen}
        />
      )}
    </div>
  );
}

// ─── chat panel ──────────────────────────────────────────────────────────────

function ChatPanel({
  description,
  setDescription,
  generating,
  progress,
  turns,
  onGenerate,
  hasDraft,
}) {
  return (
    <div className="space-y-3 rounded-co-lg border border-co-fg/10 bg-co-surface p-4">
      <div className="text-[10px] uppercase tracking-[0.22em] text-co-fg/40">
        Designer chat
      </div>
      {turns.length > 0 && (
        <div className="space-y-2 max-h-64 overflow-auto rounded-co border border-co-fg/5 bg-co-bg/40 p-3 text-xs">
          {turns.map((t, i) => (
            <div key={i}>
              <span
                className={
                  t.role === "user" ? "text-co-fg/90" : "text-co-fg/50"
                }
              >
                <strong className="mr-1">
                  {t.role === "user" ? "You:" : "Designer:"}
                </strong>
                {t.text}
              </span>
            </div>
          ))}
        </div>
      )}
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={4}
        placeholder={
          hasDraft
            ? "Ask for changes (e.g. 'add a research analyst')…"
            : "Describe the room (e.g. 'Marketing room for a B2B SaaS startup')"
        }
        className="w-full rounded-co border border-co-fg/10 bg-co-bg/40 px-3 py-2 text-sm text-co-fg placeholder:text-co-fg/30 focus:border-co-fg/30 focus:outline-none"
        disabled={generating}
      />
      <button
        onClick={onGenerate}
        disabled={generating || !description.trim()}
        className="w-full rounded-co bg-co-fg px-3 py-2 text-sm font-medium text-co-bg disabled:opacity-50"
      >
        {generating ? "Generating…" : hasDraft ? "Send" : "Generate room"}
      </button>
      {generating && progress && (
        <div className="max-h-32 overflow-auto rounded-co bg-co-bg/40 p-2 font-mono text-[10px] text-co-fg/40">
          {progress}
        </div>
      )}
    </div>
  );
}

// ─── room meta (name + description) ──────────────────────────────────────────

function RoomMeta({ draft, setDraft }) {
  return (
    <div className="space-y-2 rounded-co-lg border border-co-fg/10 bg-co-surface p-4">
      <input
        value={draft.name}
        onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
        placeholder="Room name"
        className="w-full bg-transparent text-lg font-semibold tracking-tight text-co-fg placeholder:text-co-fg/30 focus:outline-none"
      />
      <input
        value={draft.description}
        onChange={(e) =>
          setDraft((d) => ({ ...d, description: e.target.value }))
        }
        placeholder="One sentence about this room"
        className="w-full bg-transparent text-sm text-co-fg/70 placeholder:text-co-fg/30 focus:outline-none"
      />
    </div>
  );
}

// ─── stale banner ────────────────────────────────────────────────────────────

function StaleBanner({ staleTeams, teams, onRegen, onDismiss }) {
  return (
    <div className="rounded-co-lg border border-amber-500/30 bg-amber-500/[0.06] p-3 text-sm">
      <div className="mb-2 font-medium text-amber-600 dark:text-amber-400">
        These teammates may be out of date after your edit:
      </div>
      <ul className="space-y-1.5">
        {staleTeams.map((s) => {
          const team = teams.find((t) => t.id === s.teamId);
          if (!team) return null;
          return (
            <li
              key={s.teamId}
              className="flex items-center justify-between gap-3 text-xs text-co-fg/70"
            >
              <span>
                <strong>{team.name}</strong> — {s.reason}
              </span>
              <span className="flex gap-1.5">
                <button
                  onClick={() => onRegen(s.teamId)}
                  className="rounded-co-sm bg-co-fg/10 px-2 py-1 hover:bg-co-fg/20"
                >
                  Regen
                </button>
                <button
                  onClick={() => onDismiss(s.teamId)}
                  className="rounded-co-sm px-2 py-1 text-co-fg/50 hover:bg-co-fg/[0.05]"
                >
                  Dismiss
                </button>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ─── team card ───────────────────────────────────────────────────────────────

function TeamCard({
  team,
  onChange,
  onChangeAgentDef,
  onRegen,
  onRemove,
  onEdited,
}) {
  const [expanded, setExpanded] = useState(false);
  const def = team.agentDef || {};
  const tools = Array.isArray(def.tools) ? def.tools : [];
  const dangerous = tools.filter((t) => DANGEROUS_TOOLS.includes(t));

  function toggleTool(name) {
    const next = tools.includes(name)
      ? tools.filter((x) => x !== name)
      : [...tools, name];
    onChangeAgentDef({ tools: next });
    onEdited?.();
  }

  return (
    <div className="rounded-co-lg border border-co-fg/10 bg-co-surface p-4">
      <div className="flex items-start gap-3">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-co text-xl"
          style={{ background: `${team.color}22`, color: team.color }}
        >
          {team.icon || "🤖"}
        </div>
        <div className="flex-1 space-y-1">
          <input
            value={team.name}
            onChange={(e) => {
              onChange({ name: e.target.value });
            }}
            onBlur={onEdited}
            className="w-full bg-transparent text-base font-semibold tracking-tight text-co-fg placeholder:text-co-fg/30 focus:outline-none"
          />
          <input
            value={team.tagline || ""}
            onChange={(e) => onChange({ tagline: e.target.value })}
            placeholder="Role summary"
            className="w-full bg-transparent text-xs text-co-fg/60 placeholder:text-co-fg/30 focus:outline-none"
          />
        </div>
        <div className="flex shrink-0 gap-1">
          <button
            onClick={onRegen}
            className="rounded-co-sm bg-co-fg/10 px-2 py-1 text-xs text-co-fg/80 hover:bg-co-fg/20"
            title="Regenerate this teammate"
          >
            Regen
          </button>
          <button
            onClick={onRemove}
            className="rounded-co-sm px-2 py-1 text-xs text-co-fg/40 hover:bg-co-destructive/10 hover:text-co-destructive"
            title="Remove"
          >
            ✕
          </button>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-3 text-xs">
        <span className="text-co-fg/40">Color:</span>
        <div className="flex gap-1">
          {PRESET_COLORS.map((c) => (
            <button
              key={c}
              onClick={() => onChange({ color: c })}
              className={`h-5 w-5 rounded-full border-2 ${team.color === c ? "border-co-fg" : "border-transparent"}`}
              style={{ background: c }}
              aria-label={c}
            />
          ))}
        </div>
        <input
          value={team.icon || ""}
          onChange={(e) => onChange({ icon: e.target.value })}
          maxLength={4}
          placeholder="🤖"
          className="w-12 rounded-co-sm border border-co-fg/10 bg-co-bg/40 px-2 py-0.5 text-center text-xs focus:border-co-fg/30 focus:outline-none"
        />
      </div>

      {team.agentDef && (
        <>
          <div className="mt-3 flex items-center gap-2 text-xs">
            <span className="text-co-fg/40">Model:</span>
            <select
              value={def.model || "sonnet"}
              onChange={(e) => onChangeAgentDef({ model: e.target.value })}
              className="rounded-co-sm border border-co-fg/10 bg-co-bg/40 px-2 py-0.5 text-xs focus:border-co-fg/30 focus:outline-none"
            >
              {models.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-2 text-xs">
            <div className="mb-1 text-co-fg/40">Tools:</div>
            <div className="flex flex-wrap gap-1">
              {SAFE_TOOLS.map((t) => (
                <ToolChip
                  key={t}
                  name={t}
                  active={tools.includes(t)}
                  onClick={() => toggleTool(t)}
                />
              ))}
              {DANGEROUS_TOOLS.map((t) => (
                <ToolChip
                  key={t}
                  name={t}
                  active={tools.includes(t)}
                  danger
                  onClick={() => toggleTool(t)}
                />
              ))}
            </div>
            {dangerous.length > 0 && (
              <label className="mt-2 flex items-center gap-2 text-[11px] text-co-fg/70">
                <input
                  type="checkbox"
                  checked={!!def.tools_acknowledged}
                  onChange={(e) =>
                    onChangeAgentDef({ tools_acknowledged: e.target.checked })
                  }
                />
                I understand this agent can {dangerous.join(", ")} — keep
                enabled
              </label>
            )}
          </div>

          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="mt-3 text-xs text-co-fg/50 hover:text-co-fg"
          >
            {expanded ? "Hide" : "Show"} system prompt
          </button>
          {expanded && (
            <textarea
              value={def.systemPrompt || ""}
              onChange={(e) =>
                onChangeAgentDef({ systemPrompt: e.target.value })
              }
              onBlur={onEdited}
              rows={10}
              className="mt-2 w-full rounded-co border border-co-fg/10 bg-co-bg/40 px-3 py-2 font-mono text-[11px] text-co-fg focus:border-co-fg/30 focus:outline-none"
            />
          )}
        </>
      )}

      {!team.agentDef && team.agent && (
        <div className="mt-3 text-xs text-co-fg/50">
          Curated agent:{" "}
          <span className="font-mono text-co-fg/80">@{team.agent}</span>
        </div>
      )}
    </div>
  );
}

function ToolChip({ name, active, onClick, danger }) {
  const base = "rounded-co-sm border px-1.5 py-0.5 text-[10px] cursor-pointer";
  const onCls = danger
    ? "border-co-destructive/40 bg-co-destructive/10 text-co-destructive"
    : "border-co-fg/30 bg-co-fg/10 text-co-fg";
  const offCls =
    "border-co-fg/10 bg-transparent text-co-fg/40 hover:text-co-fg/70";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${base} ${active ? onCls : offCls}`}
    >
      {danger && !active ? "⚠ " : ""}
      {name}
    </button>
  );
}

// ─── regen modal ─────────────────────────────────────────────────────────────

function RegenModal({ target, teams, onClose, onSubmit }) {
  const team = teams.find((t) => t.id === target.teamId);
  const [instructions, setInstructions] = useState("");
  if (!team) return null;
  const busy = target.busy;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={busy ? undefined : onClose}
      />
      <div className="cofounder-skin relative w-full max-w-md overflow-hidden rounded-co-lg border border-co-fg/10 bg-co-surface shadow-2xl">
        <div className="px-6 py-4">
          <div className="text-[10px] uppercase tracking-[0.22em] text-co-fg/40">
            Regenerate
          </div>
          <h2 className="mt-0.5 text-lg font-semibold tracking-tight text-co-fg">
            {team.name}
          </h2>
        </div>
        <div className="space-y-3 px-6 pb-4">
          <textarea
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            rows={4}
            placeholder="What should change? (e.g. 'make it focus on technical content for developers')"
            className="w-full rounded-co border border-co-fg/10 bg-co-bg/40 px-3 py-2 text-sm text-co-fg placeholder:text-co-fg/30 focus:border-co-fg/30 focus:outline-none"
            disabled={busy}
          />
          {target.error && (
            <div className="text-sm text-co-destructive">{target.error}</div>
          )}
          <div className="flex justify-end gap-2">
            <button
              onClick={onClose}
              disabled={busy}
              className="rounded-co px-3 py-2 text-sm text-co-fg/60 hover:bg-co-fg/[0.05]"
            >
              Cancel
            </button>
            <button
              onClick={() => onSubmit(target.teamId, instructions)}
              disabled={busy}
              className="rounded-co bg-co-fg px-3 py-2 text-sm font-medium text-co-bg disabled:opacity-50"
            >
              {busy ? "Regenerating…" : "Regenerate"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function slugify(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
