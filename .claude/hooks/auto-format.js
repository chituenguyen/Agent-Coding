#!/usr/bin/env node
// PostToolUse hook for Edit / Write — runs a formatter on the touched file.
// Best-effort: silently skips if the formatter isn't installed.

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

let payload;
try {
  payload = JSON.parse(fs.readFileSync(0, "utf8"));
} catch {
  process.exit(0);
}

const file = payload.tool_input?.file_path;
if (!file || !fs.existsSync(file)) process.exit(0);

const ext = path.extname(file).slice(1).toLowerCase();
const TS_JS_EXTS = [
  "ts",
  "tsx",
  "js",
  "jsx",
  "mjs",
  "cjs",
  "json",
  "jsonc",
  "css",
  "scss",
  "md",
  "mdx",
  "html",
  "yaml",
  "yml",
];

function has(cmd) {
  try {
    execSync(`command -v ${cmd}`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function tryRun(cmd) {
  try {
    execSync(cmd, { stdio: "ignore", timeout: 5000 });
  } catch {
    /* swallow — never fail the hook */
  }
}

function findPrettier(startDir) {
  let dir = startDir;
  while (dir && dir !== "/") {
    const p = path.join(dir, "node_modules", ".bin", "prettier");
    if (fs.existsSync(p)) return p;
    dir = path.dirname(dir);
  }
  return null;
}

if (TS_JS_EXTS.includes(ext)) {
  const local = findPrettier(path.dirname(file));
  if (local) tryRun(`"${local}" --write "${file}"`);
  else if (has("prettier")) tryRun(`prettier --write "${file}"`);
  else tryRun(`npx --no-install prettier --write "${file}"`);
} else if (ext === "go") {
  if (has("gofmt")) tryRun(`gofmt -w "${file}"`);
} else if (ext === "py") {
  if (has("ruff")) tryRun(`ruff format "${file}"`);
  else if (has("black")) tryRun(`black -q "${file}"`);
} else if (ext === "rs") {
  if (has("rustfmt")) tryRun(`rustfmt --quiet "${file}"`);
}
process.exit(0);
