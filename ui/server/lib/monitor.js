import { spawn } from "child_process";

import { monitorCache } from "../state/caches.js";

export const MONITOR_TTL_MS = 3000;
export const ABTOP_PATH = `${process.env.HOME || ""}/.cargo/bin:${process.env.PATH || ""}`;

export function runAbtopOnce() {
  return new Promise((resolve) => {
    let settled = false;
    const done = (v) => {
      if (settled) return;
      settled = true;
      resolve(v);
    };
    const proc = spawn("abtop", ["--once"], {
      env: {
        ...process.env,
        PATH: ABTOP_PATH,
        TERM: "xterm-256color",
        FORCE_COLOR: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    let err = "";
    proc.stdout.on("data", (d) => {
      out += d.toString();
    });
    proc.stderr.on("data", (d) => {
      err += d.toString();
    });
    proc.on("error", (e) => {
      done({ missing: e.code === "ENOENT", text: "", error: e.message });
    });
    proc.on("close", (code) => {
      done({ missing: false, text: out, error: code === 0 ? null : err });
    });
    setTimeout(() => {
      try {
        proc.kill("SIGKILL");
      } catch {
        /* noop */
      }
      done({ missing: false, text: out, error: "timeout" });
    }, 8000);
  });
}

export { monitorCache };
