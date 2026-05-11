---
description: Run a task as a coordinated Agent Team — multiple teammates work concurrently and message each other directly. Use when a task naturally crosses team boundaries (FE + BE, or arch + impl). Counterpart of /workflow (sequential).
---

# /team-workflow Command

## Purpose

Run a task through a **coordinating team** of Claude teammates instead of the
sequential `Agent()` chain that `/workflow` uses. Each teammate:

- has their own session and context window
- runs in parallel with the others
- can `SendMessage` to teammates directly (no orchestrator round-trip)
- shares a task list and mailbox

This is the right shape when:

- the work crosses team boundaries (a feature needs FE + BE + DevOps)
- teammates need to negotiate contracts (Frontend asks Backend "what's the API
  signature?" mid-run)
- you want competing-hypothesis debugging (3 teammates pursue 3 theories)

`/workflow` is still the right tool when the chain is strictly sequential —
spec → code → review — and you want the orchestrator to gatekeep each step.

## When to Use

The user says:

- `/team-workflow [task-id]`
- "spawn the engineer team for this", "team workflow", "team it up"
- "this needs FE and BE talking"
- "rerun with the team"

## Engineer team — the default Qualgo composition

Loaded from `companies.json` (company=`qualgo`, room=`engineer`). Today:

| Teammate  | Agent            | Owns repos                             |
| --------- | ---------------- | -------------------------------------- |
| Architect | `architect`      | full allowlist (cross-cutting)         |
| Frontend  | `coder-frontend` | FE dashboards + branding sites         |
| Backend   | `coder-backend`  | `ops-platform`, `ops-platform-package` |
| DevOps    | `devops`         | `ops-k8s-assets`                       |
| Reviewer  | `reviewer`       | (no repo writes — review only)         |

Pull the live list at runtime with `Read tasks/.../target-info.md` plus
`Read companies.json` so the workflow adapts when teams are added.

## Flow

```
USER
  | /team-workflow [task-id]
  v
ORCHESTRATOR (main session)
  | 1. read tasks/[id]/input.md
  | 2. read companies.json -> resolve company.room.teams
  | 3. write tasks/[id]/team-board.md (shared task list)
  v
TeamCreate(name="qualgo-engineer-<task-id-short>")
  |
  +--[Stage A: Plan — Architect alone]
  |    Agent(name="Architect", subagent_type="architect", team_name=..., prompt="…")
  |    writes SPEC.md and tasks/[id]/team-board.md with assignments
  |
  +--[Stage B: Execute — parallel teammates]
  |    Agent(name="Frontend", subagent_type="coder-frontend", team_name=..., run_in_background=true, ...)
  |    Agent(name="Backend",  subagent_type="coder-backend",  team_name=..., run_in_background=true, ...)
  |    Agent(name="DevOps",   subagent_type="devops",         team_name=..., run_in_background=true, ...)
  |    Teammates message each other directly:
  |       SendMessage(to="Backend",  "what's the contract for POST /webhooks/x?")
  |       SendMessage(to="Frontend", "expects { id, status, payload }")
  |       SendMessage(to="DevOps",   "new env var WEBHOOK_SECRET must land in dev kustomize")
  |    Each teammate updates team-board.md when their lane is done.
  |
  +--[Stage C: Review]
  |    Agent(name="Reviewer", subagent_type="reviewer", team_name=..., prompt="…")
  |    -> review/approval.md or review/issues.md
  |
  +--[If issues] Architect rebalances board -> back to Stage B for affected lanes only
  v
TeamDelete(name=...)
ORCHESTRATOR: commit + tasks/[id]/commit.md + Learner
```

## Usage

```
/team-workflow [task-id]                          # run on existing task dir
/team-workflow --new "task description" --target /path/to/repo
/team-workflow [task-id] --teams frontend,backend  # subset (skip devops if not needed)
```

## Implementation contract

1. **Read** `tasks/[task-id]/input.md` and `companies.json`.
2. **Resolve teams**: pick the engineer room from Qualgo by default, allow
   `--teams` filter. Reject if any requested team isn't defined.
3. **Write** `tasks/[task-id]/team-board.md` template:

   ```markdown
   # Team board — [task-id]

   ## Task

   <copy from input.md>

   ## Lanes (filled by Architect)

   - [ ] Architect — design spec
   - [ ] Frontend — <empty>
   - [ ] Backend — <empty>
   - [ ] DevOps — <empty>
   - [ ] Reviewer — gate

   ## Open questions (teammates append as they arise)

   ## Decisions (Architect locks here)
   ```

4. **Stage A — plan**: spawn Architect _foreground_, prompt it to write SPEC.md
   **and** fill the lanes table with concrete deliverables per team.

5. **Stage B — execute**: read updated team-board, spawn one teammate per
   non-empty lane _in parallel_ (`run_in_background=true`, `team_name=<team>`,
   `name=<TitleCase>`). Each prompt must include:
   - the full SPEC.md content (don't make them re-read)
   - their lane row from team-board
   - the team roster (so they know who to SendMessage)
   - the path to team-board.md (so they tick their checkbox + log decisions)
   - their repo allowlist (from companies.json)

6. **Wait** for all teammates to finish. If any fail, capture stderr in
   `tasks/[task-id]/team-board.md` under "Open questions".

7. **Stage C — review**: spawn Reviewer foreground with `team_name` set so it
   can SendMessage back to teammates for clarification.

8. **Loop**: if Reviewer issues, spawn Architect again _(rebalance)_, then
   re-spawn only the affected teammates. Max 3 loops.

9. **Cleanup**: `TeamDelete(name=team_name)`. Commit the result. Spawn
   Learner.

## Spawning pattern (Claude Code)

```js
// Stage A
const team = "qualgo-engineer-" + taskId.slice(-8);
TeamCreate({ name: team });

const arch = Agent({
  subagent_type: "architect",
  team_name: team,
  name: "Architect",
  run_in_background: false,
  prompt: `… write SPEC.md AND fill tasks/${taskId}/team-board.md lanes …`,
});

// Stage B — parallel
const fe = Agent({
  subagent_type: "coder-frontend",
  team_name: team,
  name: "Frontend",
  run_in_background: true,
  prompt: feBrief,
});
const be = Agent({
  subagent_type: "coder-backend",
  team_name: team,
  name: "Backend",
  run_in_background: true,
  prompt: beBrief,
});
const dx = Agent({
  subagent_type: "devops",
  team_name: team,
  name: "DevOps",
  run_in_background: true,
  prompt: dxBrief,
});
// wait for all

// Stage C
const rv = Agent({
  subagent_type: "reviewer",
  team_name: team,
  name: "Reviewer",
  run_in_background: false,
  prompt: rvBrief,
});

TeamDelete({ name: team });
```

## Task complete when

1. `SPEC.md` written + `team-board.md` fully checked
2. Every assigned teammate reported back via `team-board.md` row check
3. `review/approval.md` status APPROVED
4. Code compiles in each touched repo
5. Git commit per repo, hashes saved in `tasks/[task-id]/commits.md`
6. Learner ran

## Status commands

```bash
# Live board for a running team-workflow
cat tasks/[task-id]/team-board.md

# Per-team summary
cat tasks/[task-id]/review/{frontend,backend,devops,architect}-summary.md
```

## Differences from `/workflow`

| Aspect            | `/workflow`                      | `/team-workflow`                               |
| ----------------- | -------------------------------- | ---------------------------------------------- |
| Spawn shape       | Sequential                       | Parallel with Architect + Reviewer as bookends |
| Inter-agent comms | Via orchestrator file IO         | Direct `SendMessage` between teammates         |
| Best for          | Single-repo, single-domain tasks | Cross-team / cross-repo tasks                  |
| Shared state      | `tasks/[id]/*.md` files          | `team-board.md` + mailbox                      |
| Failure mode      | Halts at failing agent           | Other lanes keep going; failed lane rebalances |
| Cost shape        | Lower (one agent at a time)      | Higher (concurrent) but faster wall-clock      |

## Common mistakes

- ❌ Spawning all teammates without Architect's lane assignments — they don't
  know where to draw the line. Always run Stage A first.
- ❌ Skipping `team_name` — the spawned agents won't be able to SendMessage,
  defeating the point. If you forget, fall back to `/workflow`.
- ❌ Pushing too many teammates — start with the lanes the Architect filled in,
  not "all 4 just in case". Empty lane → no teammate.
- ❌ Letting teammates touch repos outside their allowlist — pass each
  teammate's repo list via `--add-dir` only for those paths.
