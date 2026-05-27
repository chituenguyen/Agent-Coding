import { useState, useEffect } from "react";
import { api } from "../api";
import { toast } from "sonner";
import ChromeMcpStatus from "../components/ChromeMcpStatus";

const PERMISSION_MODES = [
  {
    value: "default",
    label: "Default",
    desc: "Ask for approval on sensitive actions",
  },
  {
    value: "acceptEdits",
    label: "Accept Edits",
    desc: "Auto-approve file edits, ask for other actions",
  },
  {
    value: "bypassPermissions",
    label: "Bypass Permissions",
    desc: "Skip all permission checks (use with caution)",
  },
];

// ─── helpers ────────────────────────────────────────────────────────────────

function settingsToForm(s) {
  return {
    model: s.model || "",
    theme: s.theme || "system",
    verbose: s.verbose ?? false,
    permissionMode: s.permissions?.defaultPermissionMode || "default",
    allow: (s.permissions?.allow || []).join("\n"),
    deny: (s.permissions?.deny || []).join("\n"),
    additionalDirs: (s.permissions?.additionalDirectories || []).join("\n"),
    env: s.env
      ? Object.entries(s.env).map(([k, v]) => ({ k, v }))
      : [{ k: "", v: "" }],
  };
}

function formToSettings(f) {
  const splitLines = (str) =>
    str
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
  const out = {};
  if (f.model) out.model = f.model;
  if (f.theme && f.theme !== "system") out.theme = f.theme;
  else if (f.theme === "system") out.theme = "system";
  if (f.verbose) out.verbose = true;

  const perms = {};
  if (f.permissionMode && f.permissionMode !== "default")
    perms.defaultPermissionMode = f.permissionMode;
  const allow = splitLines(f.allow);
  const deny = splitLines(f.deny);
  const dirs = splitLines(f.additionalDirs);
  if (allow.length) perms.allow = allow;
  if (deny.length) perms.deny = deny;
  if (dirs.length) perms.additionalDirectories = dirs;
  if (Object.keys(perms).length) out.permissions = perms;

  const envEntries = f.env.filter((e) => e.k);
  if (envEntries.length)
    out.env = Object.fromEntries(envEntries.map((e) => [e.k, e.v]));

  return out;
}

// ─── main ────────────────────────────────────────────────────────────────────

function ProfileCard({ account }) {
  if (!account) return null;
  const initial = (account.email || "?")[0].toUpperCase();
  return (
    <div className="mb-6 flex items-center gap-4 rounded-co-lg border border-co-fg/10 bg-co-surface p-4">
      <div
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-base font-semibold text-white"
        style={{
          background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
        }}
      >
        {initial}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-co-fg">
          {account.email || "Not signed in"}
        </div>
        <div className="mt-0.5 flex items-center gap-2 truncate text-xs text-co-fg/55">
          <span className="truncate">{account.organizationName || "—"}</span>
          {account.organizationRole && (
            <span className="rounded bg-co-fg/[0.06] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-co-fg/70">
              {account.organizationRole}
            </span>
          )}
        </div>
      </div>
      <span className="hidden items-center gap-1.5 rounded-co-sm bg-co-success/15 px-2.5 py-1 text-xs font-medium text-co-success sm:inline-flex">
        <span className="h-1.5 w-1.5 rounded-full bg-co-success shadow-[0_0_6px_rgba(81,182,127,0.7)]" />
        Signed in
      </span>
    </div>
  );
}

export default function Settings() {
  const [form, setForm] = useState(null);
  const [account, setAccount] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);
  const [models, setModels] = useState([]);

  useEffect(() => {
    api
      .getSettings()
      .then((s) => setForm(settingsToForm(s)))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
    api
      .getAccount()
      .then(setAccount)
      .catch(() => {});
    api
      .getModels()
      .then((list) =>
        setModels(
          list.map((m) => ({
            value: m.slug,
            label: `Claude ${m.label}`,
            tag:
              m.id === "opus"
                ? "Most capable"
                : m.id === "sonnet"
                  ? "Recommended"
                  : "Fastest",
          })),
        ),
      )
      .catch(() => setModels([]));
  }, []);

  function patch(updates) {
    setForm((f) => ({ ...f, ...updates }));
    setSaved(false);
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await api.saveSettings(formToSettings(form));
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading || !form)
    return (
      <div className="p-8 flex items-center gap-2 text-co-fg/45 text-sm">
        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
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
        Loading settings...
      </div>
    );

  return (
    <div className="cofounder-skin relative min-h-full bg-co-bg">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 h-[360px] w-[360px] -translate-x-1/2 rounded-full opacity-[0.06] blur-3xl"
        style={{
          background:
            "radial-gradient(circle, rgb(var(--co-accent-rgb)) 0%, transparent 70%)",
        }}
      />
      <div className="relative mx-auto max-w-2xl px-8 py-10">
        {/* Header */}
        <div className="mb-10 flex items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-co-fg/40">
              <span className="h-px w-6 bg-co-fg/20" />
              Workspace
            </div>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-co-fg">
              Settings
            </h1>
            <p className="mt-1.5 text-xs text-co-fg/55">
              Global Claude Code settings — saved to{" "}
              <code className="rounded bg-co-fg/[0.06] px-1.5 py-0.5 font-mono text-co-fg/80">
                ~/.claude/settings.json
              </code>
            </p>
          </div>
          <button
            onClick={save}
            disabled={saving}
            className={`inline-flex shrink-0 items-center gap-2 rounded-co-sm px-4 py-2 text-xs font-semibold transition-opacity ${
              saved
                ? "bg-co-success text-white"
                : "bg-co-primary text-co-primary-fg hover:opacity-90 disabled:opacity-50"
            }`}
          >
            {saving ? (
              <>
                <svg
                  className="w-4 h-4 animate-spin"
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
                Saving...
              </>
            ) : saved ? (
              <>
                <svg
                  className="w-4 h-4"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                </svg>
                Saved
              </>
            ) : (
              <>
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"
                  />
                </svg>
                Save Changes
              </>
            )}
          </button>
        </div>

        {error && (
          <div className="mb-6 p-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg text-sm text-co-destructive">
            {error}
          </div>
        )}

        <ProfileCard account={account} />

        <div className="mb-6">
          <ChromeMcpStatus />
        </div>

        <div className="space-y-6">
          {/* Model */}
          <Section
            title="Default Model"
            icon="model"
            description="Model used when no model is specified in the task."
          >
            <div className="space-y-2">
              <label className="block text-xs font-medium text-co-fg/55 mb-2">
                Model
              </label>
              <div className="grid gap-2">
                {models.map((m) => (
                  <label
                    key={m.value}
                    className={`flex items-center gap-3 p-3 border rounded-xl cursor-pointer transition-colors ${
                      form.model === m.value
                        ? "border-co-fg/30 bg-co-fg/[0.04]"
                        : "border-co-fg/10 hover:border-co-fg/25 bg-co-bg/40"
                    }`}
                  >
                    <input
                      type="radio"
                      name="model"
                      value={m.value}
                      checked={form.model === m.value}
                      onChange={() => patch({ model: m.value })}
                      className="text-co-fg"
                    />
                    <div className="flex-1">
                      <span className="text-sm font-medium text-co-fg/90">
                        {m.label}
                      </span>
                      <code className="text-xs text-co-fg/45 font-mono ml-2">
                        {m.value}
                      </code>
                    </div>
                    {m.tag && (
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          m.tag === "Recommended"
                            ? "bg-co-fg/[0.08] text-co-fg"
                            : m.tag === "Most capable"
                              ? "bg-purple-100 dark:bg-purple-900 text-purple-600 dark:text-purple-300"
                              : "bg-co-fg/[0.06] text-co-fg/55"
                        }`}
                      >
                        {m.tag}
                      </span>
                    )}
                  </label>
                ))}
                <label
                  className={`flex items-center gap-3 p-3 border rounded-xl cursor-pointer transition-colors ${
                    !models.find((m) => m.value === form.model)
                      ? "border-co-fg/30 bg-co-fg/[0.04]"
                      : "border-co-fg/10 hover:border-co-fg/25 bg-co-bg/40"
                  }`}
                >
                  <input
                    type="radio"
                    name="model"
                    value=""
                    checked={!models.find((m) => m.value === form.model)}
                    onChange={() => patch({ model: "" })}
                    className="text-co-fg"
                  />
                  <span className="text-sm text-co-fg/55">
                    Use Claude Code default
                  </span>
                </label>
              </div>
            </div>
          </Section>

          {/* Permissions */}
          <Section
            title="Permissions"
            icon="permissions"
            description="Control what actions Claude can take without asking."
          >
            {/* Permission mode */}
            <div className="mb-4">
              <label className="block text-xs font-semibold text-co-fg/70 mb-2">
                Permission Mode
              </label>
              <div className="space-y-2">
                {PERMISSION_MODES.map((pm) => (
                  <label
                    key={pm.value}
                    className={`flex items-start gap-3 p-3 border rounded-xl cursor-pointer transition-colors ${
                      form.permissionMode === pm.value
                        ? "border-co-fg/30 bg-co-fg/[0.04]"
                        : "border-co-fg/10 hover:border-co-fg/25 bg-co-bg/40"
                    }`}
                  >
                    <input
                      type="radio"
                      name="permissionMode"
                      value={pm.value}
                      checked={form.permissionMode === pm.value}
                      onChange={() => patch({ permissionMode: pm.value })}
                      className="mt-0.5 text-co-fg"
                    />
                    <div>
                      <p className="text-sm font-medium text-co-fg/90">
                        {pm.label}
                      </p>
                      <p className="text-xs text-co-fg/55 mt-0.5">{pm.desc}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Allow list */}
            <div className="mb-4">
              <label className="block text-xs font-semibold text-co-fg/70 mb-1">
                Allow List{" "}
                <span className="font-normal text-co-fg/45">
                  — one pattern per line
                </span>
              </label>
              <textarea
                rows={4}
                value={form.allow}
                onChange={(e) => patch({ allow: e.target.value })}
                placeholder={"*\nBash(git *)\nWebFetch(domain:github.com)"}
                className="w-full border border-co-fg/15 bg-co-bg text-co-fg rounded-lg px-3 py-2 text-xs font-mono focus:border-co-fg/40 outline-none resize-none"
              />
              <p className="text-xs text-co-fg/45 mt-1">
                Use <code className="bg-co-fg/[0.06] px-1 rounded">*</code> to
                allow all, or{" "}
                <code className="bg-co-fg/[0.06] px-1 rounded">
                  Tool(pattern)
                </code>{" "}
                for specific tools.
              </p>
            </div>

            {/* Deny list */}
            <div className="mb-4">
              <label className="block text-xs font-semibold text-co-fg/70 mb-1">
                Deny List{" "}
                <span className="font-normal text-co-fg/45">
                  — one pattern per line
                </span>
              </label>
              <textarea
                rows={3}
                value={form.deny}
                onChange={(e) => patch({ deny: e.target.value })}
                placeholder={"Bash(rm -rf *)\nBash(sudo *)"}
                className="w-full border border-co-fg/15 bg-co-bg text-co-fg rounded-lg px-3 py-2 text-xs font-mono focus:border-co-fg/40 outline-none resize-none"
              />
            </div>

            {/* Additional directories */}
            <div>
              <label className="block text-xs font-semibold text-co-fg/70 mb-1">
                Additional Directories{" "}
                <span className="font-normal text-co-fg/45">
                  — one path per line
                </span>
              </label>
              <textarea
                rows={3}
                value={form.additionalDirs}
                onChange={(e) => patch({ additionalDirs: e.target.value })}
                placeholder={"/tmp\n/Users/me/projects"}
                className="w-full border border-co-fg/15 bg-co-bg text-co-fg rounded-lg px-3 py-2 text-xs font-mono focus:border-co-fg/40 outline-none resize-none"
              />
              <p className="text-xs text-co-fg/45 mt-1">
                Allow Claude to read/write files in these directories.
              </p>
            </div>
          </Section>

          {/* Environment Variables */}
          <Section
            title="Environment Variables"
            icon="env"
            description="Injected into every Claude Code session."
          >
            <div className="space-y-1.5">
              {form.env.map((row, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    value={row.k}
                    onChange={(e) => {
                      const next = form.env.map((r, j) =>
                        j === i ? { ...r, k: e.target.value } : r,
                      );
                      patch({ env: next });
                    }}
                    placeholder="VARIABLE_NAME"
                    className="w-2/5 border border-co-fg/15 bg-co-bg text-co-fg rounded-lg px-2.5 py-1.5 text-xs font-mono focus:border-co-fg/40 outline-none"
                  />
                  <input
                    value={row.v}
                    onChange={(e) => {
                      const next = form.env.map((r, j) =>
                        j === i ? { ...r, v: e.target.value } : r,
                      );
                      patch({ env: next });
                    }}
                    placeholder="value"
                    className="flex-1 border border-co-fg/15 bg-co-bg text-co-fg rounded-lg px-2.5 py-1.5 text-xs font-mono focus:border-co-fg/40 outline-none"
                  />
                  <button
                    onClick={() => {
                      const next =
                        form.env.length > 1
                          ? form.env.filter((_, j) => j !== i)
                          : [{ k: "", v: "" }];
                      patch({ env: next });
                    }}
                    className="p-1 text-co-fg/30 hover:text-co-destructive transition-colors"
                  >
                    <svg
                      className="w-3.5 h-3.5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                </div>
              ))}
              <button
                onClick={() => patch({ env: [...form.env, { k: "", v: "" }] })}
                className="text-xs text-co-fg/60 hover:text-co-fg transition-colors"
              >
                + Add variable
              </button>
            </div>
          </Section>

          {/* Remote Control */}
          <RemoteControlSection />

          {/* Display */}
          <Section
            title="Display"
            icon="appearance"
            description="Appearance and output preferences."
          >
            <div className="space-y-4">
              {/* Theme */}
              <div>
                <label className="block text-xs font-semibold text-co-fg/70 mb-2">
                  Theme
                </label>
                <div className="flex gap-2">
                  {["system", "light", "dark"].map((t) => (
                    <button
                      key={t}
                      onClick={() => patch({ theme: t })}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium border capitalize transition-colors ${
                        form.theme === t
                          ? "bg-co-primary text-co-primary-fg border-co-primary"
                          : "border-co-fg/10 text-co-fg/70 hover:border-co-fg/30 bg-co-surface"
                      }`}
                    >
                      {t === "system"
                        ? "🖥 System"
                        : t === "light"
                          ? "☀️ Light"
                          : "🌙 Dark"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Verbose */}
              <label className="flex items-start gap-3 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={form.verbose}
                  onChange={(e) => patch({ verbose: e.target.checked })}
                  className="mt-0.5 w-4 h-4 text-co-fg rounded"
                />
                <div>
                  <p className="text-sm font-medium text-co-fg/80 group-hover:text-co-fg">
                    Verbose output
                  </p>
                  <p className="text-xs text-co-fg/45 mt-0.5">
                    Show detailed logs and tool call information in terminals.
                  </p>
                </div>
              </label>
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}

function RemoteControlSection() {
  const [remote, setRemote] = useState(null);
  const [loading, setLoading] = useState(false);
  const [qr, setQr] = useState(null);

  useEffect(() => {
    api
      .getRemoteStatus()
      .then((data) => {
        setRemote(data);
        // Restore QR from server state after refresh
        if (data.active && !data.paired && data.qrDataUrl) {
          setQr({
            qrDataUrl: data.qrDataUrl,
            url: data.url,
            tunnelUrl: data.tunnelUrl,
          });
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!remote?.active || remote?.paired) return;
    const t = setInterval(() => {
      api
        .getRemoteStatus()
        .then(setRemote)
        .catch(() => {});
    }, 3000);
    return () => clearInterval(t);
  }, [remote?.active, remote?.paired]);

  async function handleEnable() {
    setLoading(true);
    try {
      const data = await api.enableRemote();
      setQr(data);
      setRemote({ active: true, paired: false, tunnelUrl: data.tunnelUrl });
    } catch (err) {
      toast.error("Failed: " + err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleDisable() {
    await api.disableRemote();
    setQr(null);
    setRemote({ active: false, paired: false, tunnelUrl: null });
  }

  if (!remote) return null;

  return (
    <Section
      title="Remote Control"
      icon="remote"
      description="Access this UI from your phone — any network, anywhere."
    >
      {!remote.active ? (
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-co-fg/70">
              Create a secure tunnel for phone access
            </p>
            <p className="text-xs text-co-fg/45 mt-0.5">
              Works from any network (WiFi, 4G, etc.)
            </p>
          </div>
          <button
            onClick={handleEnable}
            disabled={loading}
            className="px-4 py-2 bg-co-primary hover:opacity-90 text-co-primary-fg text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <svg
                  className="w-3.5 h-3.5 animate-spin"
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
                Creating tunnel...
              </span>
            ) : (
              "Enable"
            )}
          </button>
        </div>
      ) : remote.paired ? (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-2.5 h-2.5 rounded-full bg-green-400 animate-pulse" />
            <div>
              <p className="text-sm font-medium text-green-700 dark:text-green-400">
                Device connected
              </p>
              {remote.tunnelUrl && (
                <p className="text-xs text-co-fg/55 font-mono">
                  {remote.tunnelUrl}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={handleDisable}
            className="px-3 py-1.5 text-xs font-medium border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950 rounded-lg transition-colors"
          >
            Disconnect & Close Tunnel
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-xs text-co-fg/55">
            Scan with your phone camera. Only one device can connect.
          </p>
          {qr && (
            <div className="flex flex-col items-center gap-3">
              <div className="bg-white p-3 rounded-xl shadow-sm">
                <img src={qr.qrDataUrl} alt="QR Code" className="w-56 h-56" />
              </div>
              <p className="text-xs text-co-fg/45 font-mono select-all break-all max-w-xs text-center">
                {qr.url}
              </p>
            </div>
          )}
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
            <span className="text-xs text-yellow-600 dark:text-yellow-400">
              Waiting for device to scan...
            </span>
          </div>
          <button
            onClick={handleDisable}
            className="px-3 py-1.5 text-xs font-medium border border-co-fg/10 text-co-fg/55 hover:text-red-500 hover:border-red-300 rounded-lg transition-colors"
          >
            Cancel
          </button>
        </div>
      )}
    </Section>
  );
}

const SECTION_ICONS = {
  model: (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <path d="M8 6V4M16 6V4M12 18v2" opacity="0.6" />
      <circle cx="9" cy="12" r="1" fill="currentColor" />
      <circle cx="15" cy="12" r="1" fill="currentColor" />
    </svg>
  ),
  permissions: (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  ),
  remote: (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 12h14" />
      <path d="M5 12a7 7 0 0 1 14 0M5 12a7 7 0 0 0 14 0" opacity="0.5" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" />
    </svg>
  ),
  appearance: (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3v18M3 12h18" opacity="0.4" />
    </svg>
  ),
  env: (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 6h16M4 12h10M4 18h7" />
      <circle cx="18" cy="12" r="1" fill="currentColor" />
      <circle cx="14" cy="18" r="1" fill="currentColor" />
    </svg>
  ),
};

function Section({ title, icon, description, children }) {
  const node = SECTION_ICONS[icon] || icon;
  return (
    <div className="overflow-hidden rounded-co-lg border border-co-fg/10 bg-co-surface">
      <div className="flex items-start gap-3 border-b border-co-fg/10 px-5 py-4">
        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-co-sm bg-co-fg/[0.06] text-co-fg/70">
          {node}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold tracking-tight text-co-fg">
            {title}
          </h2>
          {description && (
            <p className="mt-0.5 text-xs text-co-fg/55">{description}</p>
          )}
        </div>
      </div>
      <div className="px-5 py-4">{children}</div>
    </div>
  );
}
