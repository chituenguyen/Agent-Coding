export const SCOPE = { GLOBAL: "global", REPO: "repo" };
export const TRANSPORT = { STDIO: "stdio", HTTP: "http" };
export const MODAL_MODE = { ADD: "add", EDIT: "edit" };

export const EMPTY_FORM = {
  name: "",
  scope: SCOPE.GLOBAL,
  type: TRANSPORT.STDIO,
  command: "",
  args: "",
  env: [{ k: "", v: "" }],
  url: "",
  headers: [{ k: "", v: "" }],
};

export function configFromForm(f) {
  if (f.type === TRANSPORT.HTTP) {
    const headers = Object.fromEntries(
      f.headers.filter((h) => h.k).map((h) => [h.k, h.v]),
    );
    return {
      type: TRANSPORT.HTTP,
      url: f.url,
      ...(Object.keys(headers).length ? { headers } : {}),
    };
  }
  const args = f.args.trim() ? f.args.trim().split(/\s+/) : [];
  const env = Object.fromEntries(
    f.env.filter((e) => e.k).map((e) => [e.k, e.v]),
  );
  return {
    type: TRANSPORT.STDIO,
    command: f.command.trim(),
    ...(args.length ? { args } : {}),
    ...(Object.keys(env).length ? { env } : {}),
  };
}

export function formFromConfig(name, scope, cfg) {
  const isHttp = cfg.type === TRANSPORT.HTTP;
  return {
    name,
    scope,
    type: isHttp ? TRANSPORT.HTTP : TRANSPORT.STDIO,
    command: cfg.command || "",
    args: (cfg.args || []).join(" "),
    env: cfg.env
      ? Object.entries(cfg.env).map(([k, v]) => ({ k, v }))
      : [{ k: "", v: "" }],
    url: cfg.url || "",
    headers: cfg.headers
      ? Object.entries(cfg.headers).map(([k, v]) => ({ k, v }))
      : [{ k: "", v: "" }],
  };
}
