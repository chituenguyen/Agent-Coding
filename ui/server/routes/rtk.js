// RTK (Rust Token Killer) integration endpoints — install + init globally
// so Claude Code's Bash tool output is auto-compressed.
//
// Docs: https://github.com/rtk-ai/rtk
//
// Endpoints:
//   GET  /api/rtk/detect   → { installed, version? }
//   POST /api/rtk/install  → run `brew install rtk` (darwin only for now)
//   POST /api/rtk/init     → run `rtk init -g` + patch ~/.claude/settings.json
//   GET  /api/rtk/verify   → { installed, version, hookActive, gain? }

import { Router } from "express";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, writeFile } from "fs/promises";

import { GLOBAL_SETTINGS } from "../lib/paths.js";

const exec = promisify(execFile);
const router = Router();

const RTK_HOOK_COMMAND = "rtk hook claude";

async function which(bin) {
  try {
    const { stdout } = await exec("which", [bin]);
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

async function rtkVersion() {
  try {
    const { stdout } = await exec("rtk", ["--version"]);
    return stdout.trim(); // "rtk 0.42.0"
  } catch {
    return null;
  }
}

async function hookActive() {
  try {
    const raw = await readFile(GLOBAL_SETTINGS, "utf8");
    const s = JSON.parse(raw);
    const pre = s?.hooks?.PreToolUse || [];
    return pre.some(
      (group) =>
        group?.matcher === "Bash" &&
        (group.hooks || []).some((h) => h?.command === RTK_HOOK_COMMAND),
    );
  } catch {
    return false;
  }
}

// Insert RTK PreToolUse:Bash hook into ~/.claude/settings.json if missing.
async function patchSettings() {
  let s;
  try {
    s = JSON.parse(await readFile(GLOBAL_SETTINGS, "utf8"));
  } catch {
    s = {};
  }
  s.hooks ??= {};
  s.hooks.PreToolUse ??= [];

  const existingBash = s.hooks.PreToolUse.find((g) => g?.matcher === "Bash");
  const hookEntry = { type: "command", command: RTK_HOOK_COMMAND };

  if (existingBash) {
    existingBash.hooks ??= [];
    const already = existingBash.hooks.some(
      (h) => h?.command === RTK_HOOK_COMMAND,
    );
    if (!already) existingBash.hooks.push(hookEntry);
  } else {
    s.hooks.PreToolUse.push({ matcher: "Bash", hooks: [hookEntry] });
  }
  await writeFile(GLOBAL_SETTINGS, JSON.stringify(s, null, 2));
}

router.get("/api/rtk/detect", async (req, res) => {
  try {
    const bin = await which("rtk");
    const version = bin ? await rtkVersion() : null;
    res.json({ installed: Boolean(bin), version, path: bin });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Install RTK using the best method for the host OS.
//   darwin → brew install rtk
//   linux  → curl install.sh | sh   (then fall back to cargo if curl install fails and cargo exists)
//   win32  → reject with WSL instructions (RTK upstream doesn't support native Windows)
router.post("/api/rtk/install", async (req, res) => {
  const platform = process.platform;

  if (platform === "win32") {
    return res.status(400).json({
      error:
        "RTK does not support native Windows. Install WSL2 (`wsl --install` in PowerShell as admin), then re-run install from inside the WSL shell.",
      platform,
    });
  }

  try {
    if (platform === "darwin") {
      const brew = await which("brew");
      if (!brew) {
        return res.status(400).json({
          error: "Homebrew not found. Install brew first: https://brew.sh",
          platform,
        });
      }
      const { stdout, stderr } = await exec("brew", ["install", "rtk"], {
        timeout: 180_000,
        maxBuffer: 10 * 1024 * 1024,
      });
      const version = await rtkVersion();
      return res.json({
        success: true,
        method: "brew",
        version,
        stdout,
        stderr,
      });
    }

    if (platform === "linux") {
      // Try curl install.sh first (recommended by upstream).
      const curl = await which("curl");
      const sh = await which("sh");
      if (!curl || !sh) {
        return res.status(400).json({
          error:
            "curl + sh not found. Install curl via the OS package manager (e.g. `sudo apt install curl`) and retry.",
          platform,
        });
      }
      try {
        const { stdout, stderr } = await exec(
          "sh",
          [
            "-c",
            "curl -fsSL https://raw.githubusercontent.com/rtk-ai/rtk/refs/heads/master/install.sh | sh",
          ],
          { timeout: 240_000, maxBuffer: 10 * 1024 * 1024 },
        );
        const version = await rtkVersion();
        return res.json({
          success: true,
          method: "curl-install",
          version,
          stdout,
          stderr,
        });
      } catch (curlErr) {
        // Fallback to cargo if installed — gives users behind weird proxies a way out.
        const cargo = await which("cargo");
        if (!cargo) {
          return res.status(500).json({
            error: `curl install failed and cargo is not available. Install Rust (https://rustup.rs) then retry, or install RTK manually per https://github.com/rtk-ai/rtk`,
            platform,
            curlError: curlErr.message,
            stdout: curlErr.stdout,
            stderr: curlErr.stderr,
          });
        }
        const { stdout, stderr } = await exec(
          "cargo",
          ["install", "--git", "https://github.com/rtk-ai/rtk"],
          { timeout: 600_000, maxBuffer: 20 * 1024 * 1024 },
        );
        const version = await rtkVersion();
        return res.json({
          success: true,
          method: "cargo",
          version,
          stdout,
          stderr,
          note: "Installed via cargo — ensure ~/.cargo/bin is on PATH so Claude can find rtk.",
        });
      }
    }

    return res.status(400).json({
      error: `Unsupported platform: ${platform}. RTK supports darwin and linux (WSL counts as linux). See https://github.com/rtk-ai/rtk for manual install.`,
      platform,
    });
  } catch (err) {
    res.status(500).json({
      error: err.message,
      platform,
      stdout: err.stdout,
      stderr: err.stderr,
    });
  }
});

router.post("/api/rtk/init", async (req, res) => {
  try {
    if (!(await which("rtk"))) {
      return res.status(400).json({
        error: "rtk not installed — call POST /api/rtk/install first",
      });
    }
    let initStdout = "";
    let initStderr = "";
    try {
      const { stdout, stderr } = await exec("rtk", ["init", "-g"], {
        timeout: 30_000,
      });
      initStdout = stdout;
      initStderr = stderr;
    } catch (err) {
      // Non-interactive mode skips settings.json patch but still registers
      // RTK.md / CLAUDE.md@RTK.md. Treat non-zero exit as soft-fail and proceed
      // to patch settings.json ourselves.
      initStdout = err.stdout || "";
      initStderr = err.stderr || "";
    }
    await patchSettings();
    res.json({
      success: true,
      hookActive: await hookActive(),
      initStdout,
      initStderr,
      restartRequired: true,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/api/rtk/verify", async (req, res) => {
  try {
    const bin = await which("rtk");
    const version = bin ? await rtkVersion() : null;
    let gain = null;
    if (bin) {
      try {
        const { stdout } = await exec("rtk", ["gain"], { timeout: 5_000 });
        gain = stdout.trim();
      } catch {
        /* no usage yet — leave null */
      }
    }
    res.json({
      installed: Boolean(bin),
      version,
      hookActive: await hookActive(),
      gain,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
