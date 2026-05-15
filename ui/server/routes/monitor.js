import { Router } from "express";
import { spawn } from "child_process";

import { WORKSPACE } from "../lib/paths.js";
import {
  runAbtopOnce,
  ABTOP_PATH,
  MONITOR_TTL_MS,
  monitorCache,
} from "../lib/monitor.js";
import { isRemoteRequest } from "./remote.js";

const router = Router();

router.get("/api/monitor/check", async (_req, res) => {
  const r = await new Promise((resolve) => {
    let settled = false;
    const done = (v) => {
      if (settled) return;
      settled = true;
      resolve(v);
    };
    const p = spawn("abtop", ["--version"], {
      env: { ...process.env, PATH: ABTOP_PATH },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    p.stdout.on("data", (d) => {
      out += d.toString();
    });
    p.on("error", (e) => done({ installed: false, error: e.message }));
    p.on("close", (code) =>
      done({ installed: code === 0, version: out.trim() || null }),
    );
    setTimeout(() => {
      try {
        p.kill("SIGKILL");
      } catch {
        /* noop */
      }
      done({ installed: false, error: "timeout" });
    }, 5000);
  });
  res.json(r);
});

router.get("/api/monitor/snapshot", async (_req, res) => {
  const now = Date.now();
  if (now - monitorCache.at < MONITOR_TTL_MS) {
    return res.json({
      at: new Date(monitorCache.at).toISOString(),
      text: monitorCache.text,
      missing: monitorCache.missing,
      cached: true,
    });
  }
  const r = await runAbtopOnce();
  monitorCache.at = now;
  monitorCache.text = r.text || "";
  monitorCache.missing = !!r.missing;
  res.json({
    at: new Date(now).toISOString(),
    text: r.text || "",
    missing: r.missing,
    error: r.error || null,
  });
});

router.post("/api/monitor/install", (req, res) => {
  if (isRemoteRequest(req)) {
    return res.status(403).json({
      error:
        "Install must be triggered from the host machine, not a paired remote.",
    });
  }
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  const send = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  const prompt =
    "Install the abtop CLI (https://github.com/graykode/abtop) on this machine. " +
    "Pick the install method best suited to this OS: prefer the official installer " +
    "(curl --proto '=https' --tlsv1.2 -LsSf https://github.com/graykode/abtop/releases/latest/download/abtop-installer.sh | sh), " +
    "fall back to `cargo install abtop` if Rust is available. " +
    "After installation, run `abtop --version` to verify. " +
    "Reply with exactly one short final line: `OK abtop X.Y.Z` on success or `FAIL <reason>` on failure.";

  send("start", { cmd: "claude -p (install abtop via agent)" });

  const proc = spawn(
    "claude",
    [
      "-p",
      prompt,
      "--output-format",
      "stream-json",
      "--verbose",
      "--dangerously-skip-permissions",
    ],
    { cwd: WORKSPACE, env: process.env, stdio: ["ignore", "pipe", "pipe"] },
  );

  let closed = false;
  let finalText = "";
  const finish = (payload) => {
    if (closed) return;
    closed = true;
    monitorCache.at = 0;
    send("done", payload);
    res.end();
  };

  let buf = "";
  proc.stdout.on("data", (chunk) => {
    buf += chunk.toString();
    const lines = buf.split("\n");
    buf = lines.pop();
    for (const line of lines) {
      if (!line.trim()) continue;
      let event;
      try {
        event = JSON.parse(line);
      } catch {
        continue;
      }
      if (event.type === "stream_event") {
        const sub = event.event;
        if (
          sub?.type === "content_block_delta" &&
          sub.delta?.type === "text_delta" &&
          sub.delta.text
        ) {
          finalText += sub.delta.text;
          send("log", { stream: "assistant", text: sub.delta.text });
        }
        continue;
      }
      if (event.type === "assistant" && event.message?.content) {
        for (const block of event.message.content) {
          if (block.type === "tool_use") {
            const summary =
              block.input?.command ||
              block.input?.file_path ||
              JSON.stringify(block.input || {}).slice(0, 200);
            send("log", {
              stream: "tool",
              text: `\n$ [${block.name}] ${summary}\n`,
            });
          }
        }
      }
      if (event.type === "user" && event.message?.content) {
        for (const block of event.message.content) {
          if (block.type === "tool_result") {
            const txt =
              typeof block.content === "string"
                ? block.content
                : Array.isArray(block.content)
                  ? block.content.map((c) => c.text || "").join("")
                  : "";
            if (txt)
              send("log", {
                stream: "tool",
                text: txt.length > 1200 ? txt.slice(0, 1200) + "…\n" : txt,
              });
          }
        }
      }
    }
  });
  proc.stderr.on("data", (d) =>
    send("log", { stream: "stderr", text: d.toString() }),
  );
  proc.on("close", (code) => {
    const verify = spawn("abtop", ["--version"], {
      env: { ...process.env, PATH: ABTOP_PATH },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let vout = "";
    verify.stdout.on("data", (d) => (vout += d.toString()));
    verify.on("error", () =>
      finish({
        code,
        ok: false,
        error: "abtop not found on PATH after install",
      }),
    );
    verify.on("close", (vcode) => {
      if (vcode === 0) {
        send("log", { stream: "verify", text: `\n✓ ${vout.trim()}\n` });
        finish({ code, ok: true, version: vout.trim() });
      } else {
        const failMatch = finalText.match(/^FAIL\s+(.+)$/im);
        finish({
          code,
          ok: false,
          error: failMatch
            ? failMatch[1].trim()
            : "install verification failed",
        });
      }
    });
  });
  proc.on("error", (e) => finish({ code: -1, ok: false, error: e.message }));

  const killTimer = setTimeout(
    () => {
      try {
        proc.kill("SIGKILL");
      } catch {
        /* noop */
      }
      finish({ code: -1, ok: false, error: "install timeout (10m)" });
    },
    10 * 60 * 1000,
  );
  res.on("close", () => {
    clearTimeout(killTimer);
    if (!closed) {
      try {
        proc.kill("SIGKILL");
      } catch {
        /* noop */
      }
    }
  });
});

export default router;
