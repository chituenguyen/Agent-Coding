# /create-task Command

## Purpose

Initialize a new task directory for the multi-agent workflow. Equivalent to running `python3 scripts/init-task.py` but easier to invoke.

## Usage

```
/create-task "Task description" --target /path/to/repo
/create-task "Task description"
```

## When to Use

When the user says:
- `/create-task "..."`
- "tạo task ..."
- "create task ..."
- "init task ..."

## Implementation

When this command is invoked, run the init-task script with the provided arguments:

### Parse the input

From the command args, extract:
- **task description** — the quoted string or text before any flags
- **--target / -t** — optional path to the target repository

### Run the script

```bash
cd /Users/tue.nc/Desktop/agent-coding
python3 scripts/init-task.py "[task description]" --target [repo-path]
```

If no `--target` is provided:
```bash
python3 scripts/init-task.py "[task description]"
```

### After running

Report back to the user:
- Task ID created
- Project name derived
- Task directory path
- Suggest next step: `/workflow tasks/[project]/[task-id]`

## Examples

```
/create-task "Build login page" --target ~/projects/my-app
/create-task "Fix payment bug" -t /Users/me/projects/payments
/create-task "Refactor auth module"
```
