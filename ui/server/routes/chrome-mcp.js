// Chrome MCP (Claude in Chrome browser extension) status endpoint.
//
// We can only report ENABLED/ONBOARDED state from ~/.claude.json — live
// reachability of the extension is only knowable from inside a Claude Code
// session (by attempting a chrome tool call), so the UI must instruct the
// user to test live-connect manually.

import { Router } from "express";
import { readGlobalClaude } from "../lib/claude-json.js";

const router = Router();

router.get("/api/chrome-mcp/status", async (req, res) => {
  try {
    const claude = await readGlobalClaude();
    res.json({
      enabled: Boolean(claude?.claudeInChromeDefaultEnabled),
      onboarded: Boolean(claude?.hasCompletedClaudeInChromeOnboarding),
      // Live-connect cannot be probed from the backend — only a Claude Code
      // session can verify by invoking a chrome tool (e.g. tabs_context_mcp).
      liveProbeSupported: false,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
