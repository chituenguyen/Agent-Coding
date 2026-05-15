import { Router } from "express";
import { spawn } from "child_process";
import crypto from "crypto";
import QRCode from "qrcode";

import { CLOUDFLARED_BIN, PORT } from "../lib/paths.js";
import {
  remoteSession,
  resetRemoteSession,
  parseCookies,
} from "../state/remote.js";

const router = Router();

export function isRemoteRequest(req) {
  const clientIp = req.ip || req.socket.remoteAddress;
  const isLocal = ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(clientIp);
  if (isLocal) return false;
  const cookies = parseCookies(req.headers.cookie);
  return !!(
    remoteSession.active &&
    remoteSession.sessionId &&
    cookies.remote_sid === remoteSession.sessionId
  );
}

router.get("/api/remote/status", (req, res) => {
  res.json({
    active: remoteSession.active,
    paired: !!remoteSession.sessionId,
    pairedAt: remoteSession.pairedAt,
    tunnelUrl: remoteSession.tunnelUrl,
    isCurrentDeviceRemote: isRemoteRequest(req),
    // Include QR so it survives page refresh
    ...(remoteSession.active && !remoteSession.sessionId
      ? { qrDataUrl: remoteSession.qrDataUrl, url: remoteSession.pairUrl }
      : {}),
  });
});

router.post("/api/remote/enable", async (req, res) => {
  try {
    // Kill existing tunnel
    if (remoteSession.tunnelProc) {
      remoteSession.tunnelProc.kill();
      remoteSession.tunnelProc = null;
    }

    const token = crypto.randomUUID();

    // Start cloudflared quick tunnel
    const proc = spawn(
      CLOUDFLARED_BIN,
      ["tunnel", "--url", `http://localhost:${PORT}`],
      {
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    // Parse tunnel URL from stderr output
    const tunnelUrl = await new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("Tunnel creation timed out")),
        15000,
      );
      let stderr = "";
      proc.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
        const match = stderr.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
        if (match) {
          clearTimeout(timeout);
          resolve(match[0]);
        }
      });
      proc.on("exit", (code) => {
        clearTimeout(timeout);
        reject(new Error(`cloudflared exited with code ${code}`));
      });
    });

    const pairUrl = `${tunnelUrl}/?pair=${token}`;
    const qrDataUrl = await QRCode.toDataURL(pairUrl, {
      width: 280,
      margin: 2,
    });

    remoteSession.active = true;
    remoteSession.token = token;
    remoteSession.sessionId = null;
    remoteSession.pairedAt = null;
    remoteSession.tunnelUrl = tunnelUrl;
    remoteSession.tunnelProc = proc;
    remoteSession.pairUrl = pairUrl;
    remoteSession.qrDataUrl = qrDataUrl;

    proc.on("exit", () => {
      if (remoteSession.tunnelProc === proc) {
        resetRemoteSession();
        console.log("[Remote] Tunnel closed");
      }
    });

    console.log(`[Remote] Tunnel open → ${tunnelUrl}`);
    res.json({ url: pairUrl, qrDataUrl, tunnelUrl });
  } catch (err) {
    if (remoteSession.tunnelProc) {
      remoteSession.tunnelProc.kill();
      remoteSession.tunnelProc = null;
    }
    res.status(500).json({ error: `Failed to create tunnel: ${err.message}` });
  }
});

router.post("/api/remote/disable", (req, res) => {
  if (remoteSession.tunnelProc) {
    remoteSession.tunnelProc.kill();
    remoteSession.tunnelProc = null;
  }
  resetRemoteSession();
  res.json({ ok: true });
});

export default router;
