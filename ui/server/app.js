import express from "express";
import { existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";

import { UI_DIR } from "./lib/paths.js";
import { remoteSession, parseCookies } from "./state/remote.js";

export function createApp() {
  const app = express();

  app.use(express.json({ limit: "20mb" }));

  // Remote access gate — cookie-based (works through tunnels)
  app.use((req, res, next) => {
    const clientIp = req.ip || req.socket.remoteAddress;
    const isLocal = ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(clientIp);
    if (isLocal) return next();

    if (!remoteSession.active)
      return res.status(403).send("Remote access not enabled");

    // First connection with pairing token → set session cookie
    const pairToken = req.query.pair;
    if (pairToken) {
      if (pairToken !== remoteSession.token)
        return res.status(403).send("Invalid pairing token");
      if (remoteSession.sessionId)
        return res.status(403).send("Another device already paired");
      const sid = crypto.randomUUID();
      remoteSession.sessionId = sid;
      remoteSession.pairedAt = Date.now();
      res.cookie("remote_sid", sid, {
        httpOnly: true,
        sameSite: "lax",
        maxAge: 24 * 60 * 60 * 1000,
      });
      const clean =
        req.originalUrl.replace(/[?&]pair=[^&]+/, "").replace(/^\?$/, "") ||
        "/";
      return res.redirect(clean);
    }

    // Check session cookie
    const cookies = parseCookies(req.headers.cookie);
    if (cookies.remote_sid && cookies.remote_sid === remoteSession.sessionId)
      return next();

    return res.status(403).send("Not paired. Scan the QR code first.");
  });

  // Serve built frontend in production
  if (existsSync(path.join(UI_DIR, "dist"))) {
    app.use(express.static(path.join(UI_DIR, "dist")));
  }

  return app;
}
