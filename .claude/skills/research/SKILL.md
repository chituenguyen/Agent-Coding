---
name: research
description: Technical research on docs, libraries, and best practices. Use when acting as the Researcher agent — gathering findings and writing research reports to tasks/[task-id]/research/.
user-invocable: false
---

# Research Skill

## Purpose

Research documentation, libraries, and best practices. Runs in parallel with Architect at Stage 1.

## Steps

### Step 1: Understand Request

```
1. Read research request from orchestrator prompt
2. Identify:
   - What needs to be researched?
   - Which part of the task does it serve?
   - Expected output format?
```

### Step 2: Research

```
1. Official documentation
2. Best practices and patterns
3. Real code examples
4. Compare alternatives if multiple options exist
```

### Step 3: Write Report

Create `tasks/[task-id]/research/[topic].md`:

```markdown
# Research: [Topic]

## Summary
[2-3 lines]

## Key Findings
- Finding 1
- Finding 2

## Code Examples
[Concrete examples]

## Recommendation
[Clear choice with reasoning — not "both are fine"]

## References
- [links]
```

## Output

- `tasks/[task-id]/research/[topic].md`

## Key Behavior

- **Runs in parallel with Architect** — not sequential
- **Opinionated** — give a clear recommendation, don't just list options
- **Concrete examples** — always include real code examples
