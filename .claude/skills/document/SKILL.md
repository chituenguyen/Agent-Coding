---
name: document
description: Generate technical documentation and Mermaid diagrams for a task, module, or feature. Use when acting as the Documenter agent — turn SPEC.md, code, and contracts into docs a future engineer or end-user can read in one pass. Outputs README sections, architecture overviews with diagrams, API references, ADRs, sequence diagrams, ER diagrams, and state machines.
---

# Document skill

Run the Documenter agent against a task or a free-form target. The agent
reads the source-of-truth (SPEC / team-board / code) and writes docs +
Mermaid diagrams to `tasks/[project]/[task-id]/docs/` or to the target
repo's `docs/` directory.

## When to use this skill

- A `/workflow` or `/team-workflow` just finished and Reviewer approved →
  spawn Documenter to write the user-facing docs.
- User says "document this module" / "draw a diagram of X" / "write a
  README section for Y" / "generate API docs from SPEC.md".
- A `/investigate` resolved a non-trivial bug → spawn Documenter to write
  an ADR so the next person hits the answer first.

## Inputs the agent will read

1. `tasks/[project]/[task-id]/SPEC.md` (most authoritative)
2. `tasks/[project]/[task-id]/team-board.md` (contracts)
3. `tasks/[project]/[task-id]/input.md` (user's original ask)
4. `tasks/[project]/[task-id]/research/*.md` (if present)
5. `projects/[project]/context.md` (tone + conventions)
6. Target repo code — but only files SPEC names; no fishing

## Outputs

By default writes to `tasks/[project]/[task-id]/docs/` with files like:

- `architecture.md` — overview + Mermaid flowchart
- `api.md` — endpoint reference tables
- `sequence-<flow>.md` — sequence diagram + walkthrough
- `data-model.md` — ER diagram + table descriptions
- `adr/ADR-NNN-<slug>.md` — decision records
- `runbook.md` — operator guide if the feature changes deploy/ops

If the user passes `--target /path/to/repo`, writes to `<repo>/docs/`
(or `<repo>/README.md` for top-level docs) instead of the task directory.

## How to invoke

### As an Agent() call

```python
Agent({
  subagent_type: "documenter",
  description: "Document memory recall feature",
  prompt: """
You are the Documenter for task tasks/agent-coding/20260514-133548-cross-session-recall.

Produce these docs in tasks/[…]/docs/:
1. architecture.md — Mermaid flowchart of indexer/recall/inject pipeline +
   one-paragraph "What this shows" per diagram
2. api.md — `GET /api/memory/recall` reference table from contract §1
3. data-model.md — erDiagram of the SQLite schema (turns, turns_fts,
   watermarks, meta)
4. adr/ADR-001-scoring-weights.md — why 0.60/0.20/0.20

Stop conditions: all 4 files exist, each passes the "would a smart engineer
who's never seen this understand it in one pass?" self-check.
"""
})
```

### Inside `/team-workflow` as an optional lane

When the feature is user-facing and needs a README update, Architect can
add a `Documenter` row to `team-board.md`:

| Documenter | docs/architecture.md + docs/api.md + ADR-001 | [ ] |

The orchestrator then spawns Documenter alongside Frontend/Backend/QC.

### Standalone via the harness

If the user types "document X" / "draw diagram of Y" in chat:

- Pick the right output path (task dir vs repo dir)
- Spawn Documenter with a single-purpose prompt
- Don't bundle multiple unrelated doc requests — one focused agent per output

## Stop conditions

The agent is done when:

1. All target files exist and pass the markdown lint (no broken Mermaid
   blocks, no H4+ headings, no `TODO: add later` placeholders).
2. Every spec gap is explicitly flagged as `<!-- gap: ... -->` rather
   than guessed.
3. Every Mermaid diagram has a one-paragraph prose explanation next to it.

## What NOT to do with this skill

- Don't use it to write CODE comments — that's the Coder's job.
- Don't use it to write commit messages — that's the orchestrator's.
- Don't use it as a glorified summarizer of SPEC.md — docs are for readers
  OUTSIDE the design loop. If the output is just SPEC paraphrased, kill it.
