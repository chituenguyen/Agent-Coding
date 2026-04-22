#!/usr/bin/env python3
"""
check-completion.py — Check task completion status.

Usage:
  python3 check-completion.py [project/task-id]
  python3 check-completion.py [task-id]          # searches across all projects
  python3 check-completion.py --list [project]   # list all tasks in a project
"""

import os
import sys
from pathlib import Path

AGENT_CODING_PATH = "/Users/tue.nc/Desktop/agent-coding"
TASKS_PATH = f"{AGENT_CODING_PATH}/tasks"

def find_task_dir(task_id):
    """Find task directory by task-id, searching across all projects."""
    # If given as project/task-id
    if "/" in task_id:
        path = f"{TASKS_PATH}/{task_id}"
        return path if os.path.exists(path) else None

    # Search across all projects
    tasks_path = Path(TASKS_PATH)
    if not tasks_path.exists():
        return None

    for project_dir in tasks_path.iterdir():
        if not project_dir.is_dir():
            continue
        task_path = project_dir / task_id
        if task_path.exists():
            return str(task_path)

    return None

def check_completion(task_dir):
    """Check if a task is complete."""
    if not os.path.exists(task_dir):
        return False, "Task directory not found"

    approval_path = f"{task_dir}/review/approval.md"
    issues_path = f"{task_dir}/review/issues.md"
    spec_path = f"{task_dir}/SPEC.md"
    summary_path = f"{task_dir}/review/code-summary.md"

    has_approval = os.path.exists(approval_path)
    has_issues = os.path.exists(issues_path)
    has_spec = os.path.exists(spec_path)
    has_summary = os.path.exists(summary_path)

    if has_approval:
        return True, "APPROVED — task complete"
    elif has_issues:
        return False, "ISSUES FOUND — awaiting Debugger fix"
    elif has_summary:
        return False, "Code written — awaiting Reviewer"
    elif has_spec:
        return False, "SPEC ready — awaiting Coder"
    else:
        return False, "Awaiting Architect"

def list_tasks(project=None):
    """List all tasks, optionally filtered by project."""
    tasks_path = Path(TASKS_PATH)
    if not tasks_path.exists():
        print("No tasks found.")
        return

    projects = [p for p in tasks_path.iterdir() if p.is_dir()]
    if project:
        projects = [p for p in projects if p.name == project]

    for project_dir in sorted(projects):
        print(f"\n📁 {project_dir.name}")
        tasks = sorted(project_dir.iterdir(), reverse=True)
        for task in tasks:
            if not task.is_dir():
                continue
            complete, message = check_completion(str(task))
            icon = "✅" if complete else "⏳"
            print(f"  {icon} {task.name}")
            print(f"     {message}")

def main():
    if len(sys.argv) < 2:
        print("Usage: python3 check-completion.py [project/task-id]")
        print("       python3 check-completion.py --list [project]")
        sys.exit(1)

    if sys.argv[1] == "--list":
        project = sys.argv[2] if len(sys.argv) > 2 else None
        list_tasks(project)
        return

    task_id = sys.argv[1]
    task_dir = find_task_dir(task_id)

    if not task_dir:
        print(f"❌ Task not found: {task_id}")
        sys.exit(1)

    complete, message = check_completion(task_dir)
    print(f"Task:   {task_id}")
    print(f"Status: {'✅ COMPLETE' if complete else '⏳ PENDING'}")
    print(f"Stage:  {message}")

if __name__ == "__main__":
    main()
