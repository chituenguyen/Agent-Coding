---
name: team-workflow
description: Orchestrate a coordinated Agent Team for a task — Architect plans, Frontend + Backend + DevOps execute in parallel via SendMessage handoffs, Reviewer gates. Use when a task crosses team boundaries (FE+BE, or impl+infra). Counterpart of the sequential /workflow.
user-invocable: true
---

# Team-workflow skill

Run a task with **multiple teammates running concurrently and messaging each
other directly** instead of a single sequential agent chain. This is the
right pattern when a task naturally touches more than one engineering team.

## Decide whether to use this skill

Use `/team-workflow` (this skill) when:

- The task description names ≥2 teams ("FE + BE", "API + dashboard",
  "service + k8s manifest").
- There's a contract to negotiate (API signature, env var, message schema).
- The user explicitly asked for "team" or "parallel".

Otherwise prefer `/workflow` — it's cheaper and simpler.

## Inputs

- `task-id` — a directory under `tasks/[project]/[task-id]/` with `input.md`
  and optionally `target-info.md`.
- Reads `companies.json` at workspace root to discover team rosters.

## Step 1 — Plan the team

1. `Read tasks/[task-id]/input.md` and any `target-info.md`.
2. `Read companies.json` and pick `companies[].rooms[]` where
   `kind === "engineer"` for the company that owns the target repo.
   Default = `qualgo`. If the user passed `--teams a,b`, filter to that set.
3. Pick `team_name = "qualgo-engineer-" + last 8 chars of task-id`. Stable per
   task so resuming a failed run reuses the same team.

## Step 2 — Architect lane (foreground)

Spawn the Architect first, alone:

```
Agent({
  subagent_type: "architect",
  team_name,
  name: "Architect",
  run_in_background: false,
  prompt: `
You are the Architect on team ${team_name}.
Read tasks/${taskId}/input.md and the target repo.
Output two artefacts:
  1. tasks/${taskId}/SPEC.md  — the full spec (sections, data model, APIs)
  2. tasks/${taskId}/team-board.md — fill the table below with concrete
     deliverables for each teammate. Leave rows empty for teams you don't
     need; an empty row means we won't spawn that teammate.

Teammates available: ${rosterListing}

team-board.md template:
\`\`\`
# Team board — ${taskId}

## Task
<one paragraph from input.md>

## Lanes
| Team | Deliverable | Status |
|---|---|---|
| Architect | SPEC.md + this board | done |
| Frontend  |  | [ ] |
| Backend   |  | [ ] |
| DevOps    |  | [ ] |
| Reviewer  | gate | [ ] |

## Contracts (lock here once teams agree)

## Open questions (anyone appends)
\`\`\`

Make deliverables narrow and verifiable. No "wire up X" — say "create
POST /api/x with payload schema {...} and return 201 {id}".
`
});
```

Wait, then `Read tasks/${taskId}/team-board.md`. Parse out which lanes have
a non-empty Deliverable cell — those are the teammates to spawn in Stage 3.

## Step 3 — Execute in parallel

For each filled lane (NOT Architect, NOT Reviewer), spawn in one tool-use
turn (all `run_in_background: true`):

```
Agent({
  subagent_type: <team.agent>,        // coder-frontend / coder-backend / devops
  team_name,
  name: <PascalCase team name>,        // "Frontend"
  run_in_background: true,
  isolation: "worktree",               // each team works on an isolated copy
  prompt: teammateBrief({
    teamName,
    spec: <full SPEC.md content>,
    lane: <row from team-board>,
    roster: <listing of other teammates with their names + agent + repos>,
    boardPath: `tasks/${taskId}/team-board.md`,
    repoAllowlist: team.repos,
  })
});
```

`teammateBrief` template:

```
You are ${teamName} on team ${team_name}.

## Your lane
${lane}

## Your repos
You can edit files inside these directories ONLY:
${repos.join("\n")}

## The spec (don't re-read, here it is)
${spec}

## Your teammates (use SendMessage)
${roster}

## How to coordinate
- If you need a contract from a teammate, SendMessage them with a specific
  ask: "Backend, will POST /webhooks/x return 201 or 202?"
- Append decisions you reach with another teammate to the "Contracts"
  section of ${boardPath}.
- Append blockers / questions to "Open questions" so the Architect can
  resolve at the next checkpoint.
- When your lane is done, edit ${boardPath} and flip your row's Status from
  [ ] to done.

Stop conditions:
- Your lane checkbox is done AND no open questions tagged @${teamName}.
- A blocker you can't resolve via SendMessage → mark as such in Open
  questions and exit.

Do NOT touch other teams' repos. Do NOT edit Reviewer's lane.
```

Wait for **all** spawned teammates to return.

## Step 4 — Review lane

Spawn Reviewer foreground with `team_name` set so it can SendMessage back
to any teammate for clarification:

```
Agent({
  subagent_type: "reviewer",
  team_name,
  name: "Reviewer",
  run_in_background: false,
  prompt: `
Review the work done on tasks/${taskId} by ${teamCount} teammates.
Inputs: SPEC.md, team-board.md, and each teammate's worktree diff.
Write either tasks/${taskId}/review/approval.md (status APPROVED) or
tasks/${taskId}/review/issues.md (list issues per team, each tagged with
@FrontEnd / @Backend / @DevOps so the next iteration knows who to re-spawn).
You may SendMessage to any teammate to clarify intent before deciding.
`
});
```

## Step 5 — Iterate if issues

Read `tasks/${taskId}/review/issues.md`. For each `@TeamName` mentioned:

1. Spawn Architect again briefly to update team-board (mark affected rows
   back to `[ ]` with a "see issues.md" note).
2. Re-spawn ONLY the affected teammates with the same brief plus
   `issues.md` content appended.
3. Re-spawn Reviewer.

Loop max 3 times. After 3, abort with a summary for the user.

## Step 6 — Cleanup + commit

When Reviewer is APPROVED:

1. `TeamDelete({ name: team_name })`.
2. Merge each teammate's worktree branch back into the user's branch.
   Capture per-repo commit hashes in `tasks/${taskId}/commits.md`.
3. Spawn Learner (sequential, no team) to update
   `projects/[project]/context.md` with the conventions surfaced.

## File outputs

| Path                                           | Author                       |
| ---------------------------------------------- | ---------------------------- |
| `tasks/[id]/SPEC.md`                           | Architect                    |
| `tasks/[id]/team-board.md`                     | Architect + teammates        |
| `tasks/[id]/review/<team>-summary.md`          | each teammate at end-of-lane |
| `tasks/[id]/review/approval.md` or `issues.md` | Reviewer                     |
| `tasks/[id]/commits.md`                        | Orchestrator                 |

## Common mistakes to avoid

- Spawning teammates without `team_name` — they can't SendMessage and the
  whole point is lost. If you forget, kill and respawn.
- Spawning all 4 teammates regardless of architect's plan — empty lane
  means **don't spawn**.
- Letting Frontend edit `ops-platform/cmd/...` (a backend path). Pass
  `--add-dir` only for the team's repo allowlist.
- Merging worktrees before Reviewer approves. Hold all merges until Stage 6.
- Forgetting `TeamDelete` on cleanup. Stale teams accumulate in
  `~/.claude/teams/`.

## Tool reference

- `TeamCreate({ name })` — create a team.
- `TeamDelete({ name })` — tear it down.
- `Agent({ subagent_type, team_name, name, run_in_background, isolation, prompt })`
  — spawn a teammate. The `team_name` is what makes it a teammate vs a sub-agent.
- `SendMessage({ to: name, body })` — teammate-to-teammate message. Available
  to the orchestrator and to every teammate.
