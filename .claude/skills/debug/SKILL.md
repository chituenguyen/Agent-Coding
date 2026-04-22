---
name: debug
description: Bug fixing based on Reviewer issues. Use when acting as the Debugger agent — reading issues.md, finding root causes, fixing code, writing fix-log.md.
user-invocable: false
---

# Debug Skill

## Purpose

Read issues from Reviewer, find root causes, fix code, write fix-log.

## Steps

### Step 1: Read Issues

```
1. Read tasks/[task-id]/review/issues.md
2. For each issue:
   - What is the root cause?
   - Which files are affected?
   - What needs to change?
```

### Step 2: Fix

```
For each issue:
1. Locate the faulty code
2. Understand root cause (not symptoms)
3. Apply fix
4. Verify fix doesn't break related code
```

### Step 3: Write Fix Log

Create `tasks/[task-id]/review/fix-log.md`:

```markdown
# Fix Log

## Issue 1: [Title]
- **Root cause:** [Why it happened]
- **Fix applied:** [What was changed]
- **Files modified:** [list]
```

## Output

- Fixed code in target repo or `tasks/[task-id]/code/`
- `tasks/[task-id]/review/fix-log.md`

## Key Behavior

- **Root cause, not symptoms** — fix the underlying cause
- **No new bugs** — verify each fix doesn't cause side effects
- **Max 3 retries** — if still failing after 3 rounds, escalate to user
