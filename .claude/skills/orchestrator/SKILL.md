---
name: orchestrator
description: Multi-agent workflow orchestration. Use when spawning agents, running /workflow, or coordinating Architect, Researcher, Coder, Reviewer, Debugger agents in sequence.
user-invocable: false
---

# Orchestrator Workflow

## Purpose

Coordinate the multi-agent workflow by spawning agents in sequence using the `Agent()` tool. The main session is the orchestrator — there is no separate central agent.

## Workflow Chain

```
User --> Orchestrator (Main Session)
              |
              |--[Stage 1 - Parallel]------------|
              v                                  v
         ARCHITECT                          RESEARCHER
         Agent()                            Agent()
              |                                  |
              |---------------|------------------|
                              |
                  [Stage 2 - Route by task type]
                              |
              |---------------|---------------|
              v               v               v
        backend-only     frontend-only    full-stack
              |               |         (parallel)
         CODER-BE        CODER-FE     CODER-BE + CODER-FE
              |               |               |
              |---------------|---------------|
                              |
                              v
                         REVIEWER
                         Agent()
                              |
                    |---------|---------|
                    v                   v
               ISSUES FOUND          APPROVED
                    |                   |
                    v                   v
                DEBUGGER           GIT COMMIT
                Agent()            (orchestrator)
                    |                   |
                    +--> REVIEWER       v
                         (re-review)  LEARNER
                                      Agent()
                                        |
                                        v
                                       DONE
```

## Implementation

### Step 1: Read task

```python
task_dir = f"tasks/{project}/{task_id}"
input_md = read(f"{task_dir}/input.md")
target_info = read(f"{task_dir}/target-info.md")  # if exists
```

### Step 2: Spawn Architect + Researcher in parallel

```python
architect = Agent(
    subagent_type="general-purpose",
    model="sonnet",
    run_in_background=True,
    prompt=f"""
You are the Architect. Soul: "Designing systems is my passion"

Task: {task_description}
Target repo: {repo_path}

Read the target repo to understand tech stack, then write SPEC.md to:
{task_dir}/SPEC.md

SPEC.md must include:
- Task type: backend-only | frontend-only | full-stack
- Architecture, data models, API endpoints, file structure, dependencies
- If full-stack or frontend: label sections clearly as [BACKEND] and [FRONTEND]
- Acceptance criteria
"""
)

researcher = Agent(
    subagent_type="general-purpose",
    model="sonnet",
    run_in_background=True,
    prompt=f"""
You are the Researcher. Soul: "Knowledge is power"

Research: {research_topics}

Write findings to: {task_dir}/research/[topic].md
Include: summary, key findings, code examples, recommendations.
"""
)

# Wait for both to finish
```

### Step 3: Route Coder by task type

Read SPEC.md and check the `Task type:` field, then route accordingly:

#### backend-only

```python
spec = read(f"{task_dir}/SPEC.md")

coder_be = Agent(
    subagent_type="general-purpose",
    model="sonnet",
    run_in_background=False,
    prompt=f"""
You are the Coder Backend. Soul: "Clean, efficient code is art"

SPEC.md:
{spec}

Target repo: {repo_path}

Implement the backend section of SPEC. Write code directly to target repo.
When done, write summary to: {task_dir}/review/backend-summary.md
"""
)
```

#### frontend-only

```python
coder_fe = Agent(
    subagent_type="general-purpose",
    model="sonnet",
    run_in_background=False,
    prompt=f"""
You are the Coder Frontend. Soul: "Beautiful UI is a conversation between design and code"

SPEC.md:
{spec}

Target repo: {repo_path}

Implement the frontend section of SPEC. Write code directly to target repo.
Use browser MCP if available to verify the UI renders correctly.
When done, write summary to: {task_dir}/review/frontend-summary.md
"""
)
```

#### full-stack — run in parallel with worktree isolation

Each coder gets its own git worktree so they don't conflict. After both finish,
the orchestrator merges their branches back into the working branch.

```python
coder_be = Agent(
    subagent_type="general-purpose",
    model="sonnet",
    isolation="worktree",         # isolated git worktree
    run_in_background=True,       # parallel
    prompt=f"""
You are the Coder Backend. Soul: "Clean, efficient code is art"

SPEC.md:
{spec}

Target repo: {repo_path}

Implement the [BACKEND] section of SPEC only. Write code directly to target repo.
When done, write summary to: {task_dir}/review/backend-summary.md
"""
)

coder_fe = Agent(
    subagent_type="general-purpose",
    model="sonnet",
    isolation="worktree",         # isolated git worktree
    run_in_background=True,       # parallel
    prompt=f"""
You are the Coder Frontend. Soul: "Beautiful UI is a conversation between design and code"

SPEC.md:
{spec}

Target repo: {repo_path}

Implement the [FRONTEND] section of SPEC only. Write code directly to target repo.
Use browser MCP if available to verify the UI renders correctly.
When done, write summary to: {task_dir}/review/frontend-summary.md
"""
)

# Wait for both to finish
# Each agent returns a result with worktree path and branch name if it made changes.
# The orchestrator merges both branches:
#
#   be_result = <result from coder_be>  # contains branch name if changes made
#   fe_result = <result from coder_fe>  # contains branch name if changes made
#
#   cd {repo_path}
#   git merge <be_branch> --no-edit
#   git merge <fe_branch> --no-edit
#
# If merge conflict occurs, spawn Debugger to resolve it.
# Worktrees are auto-cleaned if the agent made no changes.
```

### Step 4: Spawn Reviewer

Collect all summaries that exist:

```python
summaries = []
if exists(f"{task_dir}/review/backend-summary.md"):
    summaries.append(read(f"{task_dir}/review/backend-summary.md"))
if exists(f"{task_dir}/review/frontend-summary.md"):
    summaries.append(read(f"{task_dir}/review/frontend-summary.md"))

reviewer = Agent(
    subagent_type="general-purpose",
    model="sonnet",
    run_in_background=False,
    prompt=f"""
You are the Reviewer. Soul: "Code quality is non-negotiable"

SPEC.md: {task_dir}/SPEC.md
Code location: {repo_path}
Code summaries:
{summaries}

Review the code against SPEC (both backend and frontend if full-stack).

If APPROVED: write {task_dir}/review/approval.md
If ISSUES FOUND: write {task_dir}/review/issues.md (label each issue as [BE] or [FE])
"""
)
```

### Step 5: Check result + Debug loop if needed

```python
if exists(f"{task_dir}/review/approval.md"):
    # Move to Step 6
    pass
else:
    issues = read(f"{task_dir}/review/issues.md")
    debugger = Agent(
        subagent_type="general-purpose",
        model="sonnet",
        run_in_background=False,
        prompt=f"""
You are the Debugger. Soul: "Bugs fear me"

Issues to fix:
{issues}

Code location: {repo_path}

Fix all issues. Write fix log to: {task_dir}/review/fix-log.md
"""
    )
    # Re-spawn Reviewer — repeat until approved or max 3 retries
```

### Step 6: Git Commit (after APPROVED)

```python
# Run in target repo (or task dir if no target)
commit_dir = repo_path if repo_path else task_dir

# Stage and commit all changes
result = bash(f"""
cd {commit_dir}
git add -A
git commit -m "feat: {task_description}

Task: {task_id}
Approved: {task_dir}/review/approval.md"
""")

# Save commit info
commit_hash = bash(f"cd {commit_dir} && git rev-parse HEAD").strip()
commit_md = f"""# Commit Info

**Task ID:** {task_id}
**Commit Hash:** {commit_hash}
**Repo:** {commit_dir}
**Branch:** {bash(f"cd {commit_dir} && git branch --show-current").strip()}
**Date:** {datetime.now().isoformat()}

## Rollback

```bash
cd {commit_dir}
git revert {commit_hash}
# or hard rollback:
git reset --hard {commit_hash}
```
"""
write(f"{task_dir}/commit.md", commit_md)
```

### Step 7: Spawn Learner (after APPROVED)

```python
learner = Agent(
    subagent_type="general-purpose",
    model="haiku",
    run_in_background=False,
    prompt=f"""
You are the Learner. Soul: "Every task is a lesson"

Task artifacts to read:
- SPEC: {task_dir}/SPEC.md
- Backend summary (if exists): {task_dir}/review/backend-summary.md
- Frontend summary (if exists): {task_dir}/review/frontend-summary.md
- Approval: {task_dir}/review/approval.md
- Issues (if exists): {task_dir}/review/issues.md
- Fix log (if exists): {task_dir}/review/fix-log.md

Current project context: {project_context_path}

Extract learnings from this task and update the project context file.
Merge into existing content — never overwrite. Max 10 bullet points added.
"""
)
# Learner failure is non-blocking — task is still done
```

## Agent Communication

Agents do NOT communicate directly. Everything goes through the orchestrator:

1. Orchestrator reads output of previous agent
2. Injects into the next agent's prompt
3. File system is shared state: `tasks/[project]/[task-id]/`

## Key Principles

1. **Main session is orchestrator** — spawns and coordinates all agents
2. **Sequential with gate** — each stage only runs after previous stage output is valid
3. **Stage 1 parallel** — Architect and Researcher run simultaneously
4. **Stage 2 routing** — read SPEC.md task type, then spawn backend-only, frontend-only, or both in parallel
5. **Full-stack = parallel coders** — Coder Backend and Coder Frontend run simultaneously
6. **File system is source of truth** — all state stored in `tasks/[project]/[task-id]/`
7. **Learner is non-blocking** — if it fails, task is still considered done
