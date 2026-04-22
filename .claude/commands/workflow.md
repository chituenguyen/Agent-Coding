# /workflow Command

## Purpose

Run the real multi-agent workflow by spawning agents in sequence using the `Agent()` tool in Claude Code.

## When to Use

When the user says:

- "run workflow"
- "spawn agents for this task"
- "/workflow [task-id]"

## Workflow Chain

```
User -> Orchestrator (main session)
           |
           v
      Architect Agent (spawned)
           |
           v (writes SPEC.md)
      Coder Agent (spawned)
           |
           v (writes code)
      Reviewer Agent (spawned)
           |
           v (approval / issues)
      Debugger (if needed) -> Re-review loop
           |
           v (APPROVED)
      Git Commit (orchestrator)
           |
           v (saves commit.md)
      Learner Agent (spawned)
           |
           v (updates projects/[project]/context.md)
         DONE
```

## Usage

```
/workflow [task-id]
/workflow --new "Task description" --target /path/to/repo
```

## Implementation

### When receiving `/workflow [task-id]`:

1. **Read task context** from `tasks/[task-id]/`
2. **Spawn Architect + Researcher** in parallel with Agent() tool
3. **Wait for both** to finish -> read SPEC.md and research notes
4. **Spawn Coder** with Agent() tool
5. **Wait for Coder** -> read code summary
6. **Spawn Reviewer** with Agent() tool
7. **Wait for Reviewer** -> read approval/issues
8. **If issues** -> spawn Debugger -> re-spawn Reviewer (loop max 3x)
9. **Report result** to user

### Spawning Pattern:

```python
# Stage 1 - Parallel
architect = Agent(
    subagent_type="general-purpose",
    prompt=architect_prompt,
    run_in_background=True
)
researcher = Agent(
    subagent_type="general-purpose",
    prompt=researcher_prompt,
    run_in_background=True
)
# wait for both

# Stage 2 - Sequential
coder = Agent(
    subagent_type="general-purpose",
    prompt=coder_prompt,
    run_in_background=False
)

# Stage 3
reviewer = Agent(
    subagent_type="general-purpose",
    prompt=reviewer_prompt,
    run_in_background=False
)
```

## Task Complete When:

1. Architect writes SPEC.md
2. Coder implements code
3. Reviewer writes approval.md with APPROVED status
4. Code compiles without errors
5. Git commit made, hash saved to tasks/[project]/[task-id]/commit.md
6. Learner updates projects/[project]/context.md

## Error Handling

- Architect fails -> notify user, abort
- Coder fails -> notify user, can re-run with fixes
- Debugger fails after 3 retries -> manual intervention

## Debug Loop

If Reviewer found issues:

1. Spawn Debugger -> fix issues
2. Re-spawn Reviewer -> re-review
3. Loop until approved or user intervenes

## Status Commands

```bash
# Check task progress
ls -la tasks/[task-id]/

# Check completion
cat tasks/[task-id]/review/approval.md
```
