# CLAUDE.md — Agent Coding Workspace

## What This Is

This is an **Agent Coding Workspace** — an automated multi-agent system where each agent has its own "soul", orchestrated by the main session, working until the task is complete.

**This file is the source of truth** — loaded at the start of every session.

---

## How It Works

### Multi-Agent System

```
USER INPUT
/workflow [task-id]
       |
       v
ORCHESTRATOR (Main Session)
       |
       |--[Stage 1 - Parallel]------------|
       v                                  v
  ARCHITECT                          RESEARCHER
  -> SPEC.md (labels task type)       -> research/[topic].md
       |                                  |
       |---------------|------------------|
                       |
            [Stage 2 - Route by task type]
                       |
       |---------------|---------------|
       v               v               v
  backend-only    frontend-only    full-stack
       |               |           (parallel)
  CODER-BE        CODER-FE      CODER-BE + CODER-FE
       |               |               |
       |---------------|---------------|
                       |
                       v
                  REVIEWER
                       |
             |---------|---------|
             v                   v
        ISSUES FOUND          APPROVED
             |                   |
             v                   v
          DEBUGGER           GIT COMMIT
          -> fix code        (orchestrator)
          -> fix-log.md          |
             |                   v
             +--> REVIEWER    LEARNER
                  (re-review)    |
                                 v
                                DONE
```

### Agent Souls

| Agent               | Soul                                              | Model  | Role                                           |
| ------------------- | ------------------------------------------------- | ------ | ---------------------------------------------- |
| **Architect**       | "Designing systems is my passion"                 | sonnet | Analyze requirements, write SPEC.md            |
| **Researcher**      | "Knowledge is power"                              | sonnet | Research docs, libraries, best practices       |
| **Coder Backend**   | "Clean, efficient code is art"                    | haiku  | Implement backend — API, DB, services          |
| **Coder Frontend**  | "Beautiful UI is a conversation between design and code" | sonnet | Implement UI, verify with browser MCP |
| **Reviewer**        | "Code quality is non-negotiable"                  | sonnet | Review code, approve or reject                 |
| **Debugger**        | "Bugs fear me"                                    | sonnet | Fix issues found by Reviewer                   |
| **Learner**         | "Every task is a lesson"                          | sonnet | Extract learnings, update context.md           |

Agents **do not communicate directly** — the orchestrator reads each agent's output and injects it into the next agent's prompt.

---

## Commands

### `python3 scripts/init-task.py [description] --target [repo-path]`

Initialize a task directory:

```bash
python3 scripts/init-task.py "Write API for user service" --target /path/to/repo
python3 scripts/init-task.py "Fix payment bug" -t ~/projects/payment
python3 scripts/init-task.py "Refactor auth module"  # no target
```

### `/workflow [task-id]`

Spawn agents in sequence — **this actually runs agents**:

```
/workflow 20260421-143300-write-api-user-service
/workflow --new "Task description" --target /path/to/repo
```

---

## Spawning Agents

Main session uses the `Agent()` tool to spawn each agent:

```python
# Stage 1 - Parallel
architect = Agent(subagent_type="general-purpose", run_in_background=True, prompt="...")
researcher = Agent(subagent_type="general-purpose", run_in_background=True, prompt="...")
# wait for both to finish

# Stage 2 - Route by task type (read from SPEC.md)
# backend-only:
coder_be = Agent(subagent_type="general-purpose", run_in_background=False, prompt="...")

# frontend-only:
coder_fe = Agent(subagent_type="general-purpose", run_in_background=False, prompt="...")

# full-stack (parallel):
coder_be = Agent(subagent_type="general-purpose", run_in_background=True, prompt="...")
coder_fe = Agent(subagent_type="general-purpose", run_in_background=True, prompt="...")
# wait for both

# Stage 3 - Review
reviewer = Agent(subagent_type="general-purpose", run_in_background=False, prompt="...")

# Stage 4 - If issues found
debugger = Agent(subagent_type="general-purpose", run_in_background=False, prompt="...")
# -> re-spawn Reviewer
```

---

## Scripts

| Script                             | Purpose                          |
| ---------------------------------- | -------------------------------- |
| `scripts/init-task.py`             | Initialize task directory        |
| `scripts/workflow-orchestrator.py` | Generate agent prompts           |
| `scripts/check-completion.py`      | Check task completion status     |

---

## Workspace Structure

```
agent-coding/
├── CLAUDE.md
├── .claude/
│   ├── agents/               # Agent soul definitions
│   │   ├── architect.md
│   │   ├── coder-backend.md
│   │   ├── coder-frontend.md
│   │   ├── reviewer.md
│   │   ├── debugger.md
│   │   ├── researcher.md
│   │   └── learner.md
│   ├── commands/
│   │   └── workflow.md       # /workflow command
│   └── skills/
│       ├── orchestrator.md   # How to spawn agents
│       ├── architect.md
│       ├── code-write.md
│       ├── code-review.md
│       ├── debug.md
│       └── research.md
├── projects/                 # Per-project context and conventions
│   └── [project-name]/
│       └── context.md        # Tech stack, conventions, forbidden patterns
├── tasks/                    # Task workspaces organized by project
│   └── [project-name]/
│       └── [task-id]/
│           ├── input.md          # Task description + project context
│           ├── target-info.md    # Target repo info (if any)
│           ├── SPEC.md           # Architect output
│           ├── research/         # Researcher output
│           │   └── [topic].md
│           ├── code/             # Code output (if no target repo)
│           ├── commit.md         # Git commit hash (for rollback)
│           └── review/
│               ├── backend-summary.md    # Coder Backend output
│               ├── frontend-summary.md   # Coder Frontend output
│               ├── approval.md           # Reviewer output (if APPROVED)
│               ├── issues.md             # Reviewer output (if ISSUES)
│               └── fix-log.md            # Debugger output
└── scripts/
    ├── init-task.py
    ├── workflow-orchestrator.py
    └── check-completion.py
```

---

## Quick Start

```bash
# 1. Init task (auto-creates project folder and context.md template)
python3 scripts/init-task.py "Write login API" --target /path/to/repo

# 2. (Optional) Edit project conventions
edit projects/[project-name]/context.md

# 3. Run workflow (inside Claude Code session)
/workflow tasks/[project-name]/[task-id]

# 4. Check result
cat tasks/[project-name]/[task-id]/review/approval.md

# 5. List all tasks
python3 scripts/check-completion.py --list
python3 scripts/check-completion.py --list [project-name]
```

---

## Workflow Stages

| Stage | Agents                          | Parallel?        | Output                                    |
| ----- | ------------------------------- | ---------------- | ----------------------------------------- |
| 1     | Architect, Researcher           | Yes              | SPEC.md (with task type) + research/      |
| 2     | Coder Backend and/or Frontend   | Yes (full-stack) | backend-summary.md + frontend-summary.md  |
| 3     | Reviewer                        | No               | approval.md or issues.md                  |
| 4     | Debugger (if needed)            | No               | Fixed code + fix-log.md                   |
| 5     | Orchestrator                    | No               | Git commit + commit.md                    |
| 6     | Learner                         | No               | Updated projects/[name]/context.md        |

---

## Agent Behavior Guidelines

Applies to all agents when executing tasks.

### 1. Think Before Acting

- **State assumptions explicitly** — if requirements are ambiguous, document assumptions before implementing
- **Surface tradeoffs** — if multiple approaches exist, list them and choose with reasoning
- **Stop when confused** — don't guess; write what is unclear into the output file

### 2. Simplicity First

- **Minimum code** that solves the problem — nothing beyond the SPEC
- **No abstractions** for single-use code
- **No flexibility/configurability** unless requested
- **No error handling** for impossible scenarios
- Ask: *"Would a senior engineer say this is overcomplicated?"* If yes, simplify

### 3. Surgical Changes

- **Only touch files that need changing** — don't improve surrounding code
- **Don't refactor** things that aren't broken
- **Match existing style** of the target repo
- If unrelated dead code is noticed → note it in output, don't delete it

### 4. Goal-Driven Execution

Define success criteria before implementing:

```
Architect       : SPEC.md is complete when Coders can implement without asking questions
                  Must label task type: backend-only | frontend-only | full-stack
Coder Backend   : Code is complete when it compiles/runs and matches SPEC backend section 100%
Coder Frontend  : Code is complete when UI renders, matches SPEC frontend section, verified via browser MCP
Reviewer        : Review is complete when approval.md or issues.md is actionable
Debugger        : Fix is complete when every issue in issues.md is addressed
```

---

## Task Completion Criteria

1. `review/approval.md` exists with status APPROVED
2. Code written to target repo
3. Code compiles/runs without errors

---

## Notes

- **Orchestrator = Main session** — spawns and coordinates all agents
- **File system = shared state** — agents communicate via `tasks/[project]/[task-id]/`
- **Project context** — `projects/[project]/context.md` loaded by all agents for conventions
- **Stage 1 is parallel** — Architect and Researcher run simultaneously
- **Stage 2 is routed** — Architect labels task type in SPEC.md; orchestrator spawns backend-only, frontend-only, or both in parallel
- **Sequential after Stage 2** — Reviewer -> Debugger (if needed) -> Re-review
