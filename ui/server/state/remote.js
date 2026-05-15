// Remote-control state: cloudflare tunnel + cookie pairing.
// Mutated in place (never reassigned) so that importers get a live binding.

export const remoteSession = {
  active: false,
  token: null, // one-time pairing token in QR URL
  sessionId: null, // cookie value for paired device
  pairedAt: null,
  tunnelUrl: null,
  tunnelProc: null, // cloudflared child process
  pairUrl: null,
  qrDataUrl: null,
};

export function resetRemoteSession() {
  remoteSession.active = false;
  remoteSession.token = null;
  remoteSession.sessionId = null;
  remoteSession.pairedAt = null;
  remoteSession.tunnelUrl = null;
  remoteSession.tunnelProc = null;
  remoteSession.pairUrl = null;
  remoteSession.qrDataUrl = null;
}

export function parseCookies(cookieHeader) {
  const cookies = {};
  if (!cookieHeader) return cookies;
  cookieHeader.split(";").forEach((c) => {
    const [k, ...v] = c.trim().split("=");
    if (k) cookies[k] = v.join("=");
  });
  return cookies;
}
