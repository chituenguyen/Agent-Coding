---
name: code-write
description: Code implementation according to SPEC.md. Use when acting as the Coder agent — reading the spec and writing code directly into the target repo.
user-invocable: false
---

# Code-Write Skill

## Purpose

Implement code according to SPEC.md. Write directly into target repo if one exists.

## Steps

### Step 1: Read SPEC and Context

```
1. Read tasks/[task-id]/SPEC.md — understand all requirements
2. Read tasks/[task-id]/research/ — if research from Researcher exists
3. If target repo exists:
   - Read target-info.md -> get path
   - Read existing files -> understand conventions, naming, patterns
```

### Step 2: Implement

```
1. Create file structure per SPEC
2. Implement each component:
   - Data models / entities
   - Business logic
   - API endpoints / handlers
   - Configuration files
3. Follow conventions of target repo (naming, structure, patterns)
4. Ensure code compiles/runs
```

### Step 3: Write Summary

After finishing, create `tasks/[task-id]/review/code-summary.md`:

```markdown
# Code Summary

## Files Created
- path/to/file1 — [description]
- path/to/file2 — [description]

## Files Modified
- path/to/existing — [description of changes]

## Notes
[Anything the Reviewer should know]
```

## Output

- Code files in target repo or `tasks/[task-id]/code/`
- `tasks/[task-id]/review/code-summary.md`

## Checklist Before Done

- [ ] Code matches SPEC.md — no sections skipped
- [ ] Naming conventions of target repo followed
- [ ] Code compiles/runs without errors
- [ ] No TODOs or stubs left unimplemented
- [ ] code-summary.md written
