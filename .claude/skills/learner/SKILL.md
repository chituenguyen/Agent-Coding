---
name: learner
description: Extract learnings from a completed task and update project context.md. Use after Reviewer approves a task.
user-invocable: false
---

# Learner Skill

## Purpose

Extract learnings from a completed task and merge them into `projects/[project]/context.md` so future agents on the same project benefit from accumulated knowledge.

## Steps

### Step 1: Read Task Artifacts

```
1. Read tasks/[project]/[task-id]/SPEC.md
2. Read tasks/[project]/[task-id]/review/code-summary.md
3. Read tasks/[project]/[task-id]/review/approval.md
4. Read tasks/[project]/[task-id]/review/issues.md (if exists)
5. Read tasks/[project]/[task-id]/review/fix-log.md (if exists)
```

### Step 2: Read Current Context

```
Read projects/[project]/context.md — understand what's already known
so you don't duplicate, only add new knowledge
```

### Step 3: Extract Learnings

From each artifact, extract:

```
SPEC.md:
- Architecture decisions and reasoning
- Tech stack additions/confirmations

code-summary.md:
- File structure patterns
- Naming conventions used
- Notable implementation choices

issues.md + fix-log.md:
- Root causes of bugs -> add to Forbidden Patterns
- Recurring mistakes -> add as warnings

approval.md:
- Things Reviewer explicitly praised -> confirm as conventions
```

### Step 4: Update context.md

Merge learnings into `projects/[project]/context.md`:

```markdown
## Tech Stack
[Add any new tech used]

## Coding Conventions
[Add confirmed patterns]

## Forbidden Patterns
[Add root causes of bugs found in this task]

## Task History
- [task-id]: [one-line summary of what was built]
```

**Rules:**
- Append to existing sections, never replace
- Add `## Task History` section if not present
- Max 10 bullet points added per task
- Only add project-specific knowledge — skip generic best practices

## Output

- Updated `projects/[project]/context.md`

## Key Behavior

- **Merge, don't overwrite** — existing content is sacred
- **Be specific** — "use `src/modules/[name]/` structure" not "use modules"
- **Only add signal** — if it's obvious, skip it
