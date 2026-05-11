---
name: investigate
description: >-
  Interactive bug root cause investigation. User describes a bug, skill traces
  through codebase and identifies causal chain. Use when acting as the
  Investigator agent.
---
# Investigate Skill

## Purpose

Trace a bug from symptom to root cause. Produce a causal chain with file:line evidence.
This skill is conversational — gather info from the user if needed, then investigate.

## Trigger

User invokes `/investigate` or describes a bug and asks for root cause analysis.

## Steps

### Step 1 — Understand the Bug

Extract from the user's description:
- **Observed behavior** — what actually happens
- **Expected behavior** — what should happen
- **Trigger** — what action/input/condition causes it
- **Error message / stack trace** — if any

If any critical piece is missing, ask once:
> "To investigate effectively, I need: [list missing pieces]. Can you share these?"

### Step 2 — Locate Entry Point

Find where the bug's trigger enters the code:
- API route handler
- Event listener / DOM handler
- CLI command entry
- Scheduled job / cron
- Middleware

Use `Grep` to search by function name, route path, error string, or keywords from the description.

### Step 3 — Trace the Call Chain

Follow execution from entry point toward the failure:
```
entry point
  -> called function A (read file:line)
  -> called function B (read file:line)
  -> state mutation / wrong assumption <- suspect zone
  -> failure point (where error surfaces)
```

Read files at each step. Don't skip levels — intermediate steps often hold the real cause.

### Step 4 — Form Hypotheses

List 1-3 candidate root causes, ranked by likelihood:
1. Most likely: [why]
2. Alternative: [why]
3. Edge case: [why]

### Step 5 — Verify

Read the code at each candidate:
- Is the logic wrong?
- Is there a wrong assumption about input type, null, async timing?
- Is there a missing guard, off-by-one, wrong variable?
- Is it a config/env issue?

Eliminate false positives. Confirm the root cause with a direct quote from the code.

### Step 6 — Write Root Cause Report

```markdown
## Bug: [one-line summary]

### Observed vs Expected
- Observed: [what happens]
- Expected: [what should happen]
- Trigger: [what causes it]

### Causal Chain
1. `path/to/file.ts:42` — [trigger: user does X]
2. `path/to/service.ts:87` — [X calls Y, passes bad value]
3. `path/to/util.ts:13` — **ROOT CAUSE**: [Y assumes value is non-null, crashes]

### Evidence
```code
// path/to/util.ts:13
function process(val) {
  return val.trim() // crashes when val is null
}
```
Called from service.ts:87 without null check.

### Fix Direction
Add null guard in `util.ts:13` or validate before calling at `service.ts:87`.
```

### Step 7 — Run code (if `--run` provided)

After the Root Cause Report, execute code to confirm the bug or verify a fix.

**Auto-detect run command** (in order of priority):
1. User passed explicit cmd: `--run "npm test"` → use it directly
2. `package.json` has a `test` script → `npm test`
3. `Makefile` has a `test` target → `make test`
4. `pyproject.toml` / `setup.py` present → `pytest`
5. `go.mod` present → `go test ./...`
6. None found → ask the user: *"What command should I run to verify? e.g. `npm test`, `pytest`, `make test`"*

**Execute and report:**
```bash
cd {target_path} && {run_command}
```

Present:
- Pass / fail status
- Relevant lines from stdout/stderr (skip noise)
- Whether output **confirms** the root cause or points elsewhere

**If `--fix` was also passed:** re-run after applying the fix to confirm the bug is gone.
If tests still fail after fix, note it and do not claim the bug is resolved.

## Key Behavior

- **Causal chain, not just crash location** — "null at line 42" is incomplete
- **Ask once** — one question with all missing info, not a dialogue
- **Don't fix** — unless user says `--fix` or asks explicitly
- **Narrow scope** — follow the trail, don't audit unrelated code
- **Cite everything** — every claim = file:line
- **`--run` confirms, not guesses** — only report "bug confirmed" / "fix verified" based on actual command output
