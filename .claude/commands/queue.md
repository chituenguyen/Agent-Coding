# /queue Command

## Purpose

Manage a task queue for sequential workflow processing. Tasks are stored in `queue.json` at the workspace root.

## Usage

```
/queue add "Task description" --target /path/to/repo
/queue add "Task description"
/queue list
/queue start
/queue clear
/queue clear --failed
```

## Commands

### `add`

Add a task to the queue. Append to `queue.json` tasks array:

```json
{
  "description": "the task description",
  "target": "/path/to/repo or null",
  "status": "pending",
  "task_id": null,
  "project": null,
  "added_at": "ISO timestamp",
  "finished_at": null,
  "error": null
}
```

After adding, print confirmation with queue position.

### `list`

Read `queue.json` and display all tasks with status icons:

```
[ ] 1. Task description (target: /path)
[>] 2. Running task (task: 20260422-...)
[x] 3. Done task
[!] 4. Failed task
     Error: what went wrong
```

### `start`

Start processing the queue sequentially. This is the main loop:

```
1. Read queue.json
2. Find first task with status "pending"
3. If no pending tasks -> check if all are failed -> stop
4. If pending task found:
   a. Set status to "running" in queue.json
   b. Run: python3 scripts/init-task.py "description" [--target path]
   c. Capture task_id and project from init-task output
   d. Update queue.json with task_id and project
   e. Run: /workflow tasks/[project]/[task-id]
   f. If workflow succeeds -> set status to "done", set finished_at
   g. If workflow fails -> set status to "failed", set error message, set finished_at
5. Read queue.json again (may have new tasks added)
6. Go to step 2
```

**Stop conditions:**
- No pending tasks remain AND no running tasks -> done
- All non-done tasks are failed (zero pending, zero done, one or more failed) -> stop, report all failures

**Important:** Re-read `queue.json` from disk before each pick — the user may have added new tasks while the queue is running.

### `clear`

Remove tasks from `queue.json`:
- `/queue clear` — remove tasks with status "done"
- `/queue clear --failed` — remove tasks with status "failed"
- `/queue clear --all` — remove all tasks

## queue.json Schema

```json
{
  "tasks": [
    {
      "description": "string — task description",
      "target": "string|null — target repo path",
      "status": "pending|running|done|failed",
      "task_id": "string|null — set after init-task runs",
      "project": "string|null — project name from init-task",
      "added_at": "ISO datetime",
      "finished_at": "ISO datetime|null",
      "error": "string|null — error message if failed"
    }
  ]
}
```

## Examples

```
# Add tasks
/queue add "Build login API" --target ~/projects/my-app
/queue add "Fix payment bug" --target ~/projects/my-app
/queue add "Add email notifications" --target ~/projects/my-app

# Check queue
/queue list

# Start processing (runs all pending tasks sequentially)
/queue start

# While running, add more tasks from another session or interrupt:
/queue add "Refactor auth module" --target ~/projects/my-app

# Clean up
/queue clear
```
