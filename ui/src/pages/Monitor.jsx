import { useState } from "react";

export default function Monitor() {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText("claude agents");
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Silently revert on failure
    }
  };

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100">
      <div className="max-w-3xl mx-auto px-6 py-12">
        {/* Hero */}
        <h1 className="text-4xl font-bold mb-4">Manage Claude Code sessions</h1>
        <p className="text-lg text-gray-600 dark:text-gray-400 mb-8">
          Background Claude Code sessions are now supervised from the terminal
          with{" "}
          <code className="bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">
            claude agents
          </code>
          . The in-product Monitor has been replaced by a launcher for the
          official TUI.
        </p>

        {/* Launch command card */}
        <div className="border border-gray-300 dark:border-gray-700 rounded-lg p-6 mb-8 bg-gray-50 dark:bg-gray-900">
          <pre className="bg-gray-900 dark:bg-gray-800 text-gray-100 p-4 rounded mb-3 font-mono text-sm overflow-x-auto">
            <code>claude agents</code>
          </pre>
          <button
            onClick={handleCopy}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md text-sm font-medium transition-colors"
            aria-label="Copy command"
          >
            {copied ? "Copied" : "Copy"}
          </button>
          <p className="text-gray-600 dark:text-gray-400 text-sm mt-3">
            Runs on the machine where the Claude Code CLI is installed.
          </p>
        </div>

        {/* What it shows */}
        <div className="mb-8">
          <h2 className="text-xl font-semibold mb-4">What it shows</h2>
          <ul className="space-y-2 text-gray-700 dark:text-gray-300">
            <li className="flex items-start">
              <span className="mr-3">•</span>
              <span>
                Sessions grouped by state: Needs input, Working, Ready for
                review, Completed.
              </span>
            </li>
            <li className="flex items-start">
              <span className="mr-3">•</span>
              <span>
                Per-session NL summary auto-generated from current activity.
              </span>
            </li>
            <li className="flex items-start">
              <span className="mr-3">•</span>
              <span>
                Pull-request status dot per session (pending / passing / merged
                / draft).
              </span>
            </li>
            <li className="flex items-start">
              <span className="mr-3">•</span>
              <span>Header count of sessions across all groups.</span>
            </li>
            <li className="flex items-start">
              <span className="mr-3">•</span>
              <span>
                Peek, reply, attach, and dispatch without leaving the TUI.
              </span>
            </li>
            <li className="flex items-start">
              <span className="mr-3">•</span>
              <span>
                Visible across every project and worktree on this machine.
              </span>
            </li>
          </ul>
        </div>

        {/* Requirements */}
        <div className="mb-8">
          <h2 className="text-xl font-semibold mb-4">Requirements</h2>
          <ul className="space-y-2 text-gray-700 dark:text-gray-300">
            <li className="flex items-start">
              <span className="mr-3">•</span>
              <span>
                Claude Code v2.1.139 or newer. Check with{" "}
                <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded text-sm">
                  claude --version
                </code>
                .
              </span>
            </li>
            <li className="flex items-start">
              <span className="mr-3">•</span>
              <span>
                Run{" "}
                <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded text-sm">
                  claude update
                </code>{" "}
                to upgrade if needed.
              </span>
            </li>
            <li className="flex items-start">
              <span className="mr-3">•</span>
              <span>
                Local terminal only —{" "}
                <strong>
                  claude agents does not work over the paired-remote tunnel
                </strong>
                .
              </span>
            </li>
          </ul>
        </div>

        {/* Docs button */}
        <div className="mb-8">
          <a
            href="https://code.claude.com/docs/en/agent-view"
            target="_blank"
            rel="noreferrer noopener"
            className="inline-block px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md font-medium transition-colors"
          >
            Open agent-view docs
          </a>
        </div>

        {/* Footer note */}
        <p className="text-sm text-gray-500 dark:text-gray-500">
          Replaces the previous abtop-based monitor. Codex and OpenCode sessions
          are no longer surfaced here.
        </p>
      </div>
    </div>
  );
}
