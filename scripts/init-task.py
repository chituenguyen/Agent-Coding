#!/usr/bin/env python3
"""
init-task.py — Initialize a new task in the multi-agent workflow
Supports --target to work with external repos, organized by project.
"""

import sys
import os
from datetime import datetime
import re
from pathlib import Path

AGENT_CODING_PATH = "/Users/tue.nc/Desktop/agent-coding"
TASKS_PATH = f"{AGENT_CODING_PATH}/tasks"
PROJECTS_PATH = f"{AGENT_CODING_PATH}/projects"

def slugify(text):
    text = text.lower()
    text = re.sub(r'[^\w\s-]', '', text)
    text = re.sub(r'[-\s]+', '-', text)
    return text[:50]

def get_project_name(target_repo=None):
    """Derive project name from target repo path, or use 'workspace'."""
    if not target_repo:
        return "workspace"
    return slugify(Path(target_repo).name)

def load_project_context(project_name):
    """Load project-specific context/conventions if exists."""
    context_path = f"{PROJECTS_PATH}/{project_name}/context.md"
    if os.path.exists(context_path):
        with open(context_path) as f:
            return f.read()
    return None

def create_project_context_template(project_name, target_repo):
    """Create a context.md template if project is new."""
    project_dir = f"{PROJECTS_PATH}/{project_name}"
    context_path = f"{project_dir}/context.md"

    if os.path.exists(context_path):
        return  # Already exists

    os.makedirs(project_dir, exist_ok=True)
    template = f"""# Project Context: {project_name}

**Repo path:** {target_repo or "N/A"}

## Tech Stack

<!-- Describe the tech stack, frameworks, languages used -->

## Coding Conventions

<!-- Naming conventions, file structure rules, patterns to follow -->

## Forbidden Patterns

<!-- Things agents must NOT do in this project -->

## Notes

<!-- Any other context agents should know before working on this project -->
"""
    with open(context_path, "w") as f:
        f.write(template)
    print(f"📋 Created project context: {context_path}")
    print(f"   → Edit this file to add project-specific conventions")

def create_task(task_description, target_repo=None):
    """Create task directory structure under tasks/[project]/[task-id]/"""
    project_name = get_project_name(target_repo)
    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    slug = slugify(task_description)
    task_id = f"{timestamp}-{slug}"
    task_dir = f"{TASKS_PATH}/{project_name}/{task_id}"

    # Create task directory structure
    os.makedirs(f"{task_dir}/code", exist_ok=True)
    os.makedirs(f"{task_dir}/review", exist_ok=True)
    os.makedirs(f"{task_dir}/research", exist_ok=True)

    # Load or create project context
    project_context = load_project_context(project_name)
    if target_repo:
        create_project_context_template(project_name, target_repo)

    context_section = ""
    if project_context:
        context_section = f"\n## Project Context\n\n{project_context}\n"
    else:
        context_path = f"{PROJECTS_PATH}/{project_name}/context.md"
        context_section = f"\n## Project Context\n\nSee: {context_path}\n"

    target_section = ""
    if target_repo:
        target_section = f"\n## Target Repository\n\n**Path:** {target_repo}\n**Name:** {Path(target_repo).name}\n"

    # Write input.md
    input_md = f"""# Task Input

**Task ID:** {task_id}
**Project:** {project_name}
**Created:** {datetime.now().isoformat()}
**Description:** {task_description}
{target_section}{context_section}
## User's Request

{task_description}
"""
    with open(f"{task_dir}/input.md", "w") as f:
        f.write(input_md)

    # Write target-info.md if target specified
    if target_repo:
        target_info_md = f"""# Target Repository Info

**Path:** {target_repo}
**Name:** {Path(target_repo).name}
**Project:** {project_name}
**Project context:** {PROJECTS_PATH}/{project_name}/context.md
"""
        with open(f"{task_dir}/target-info.md", "w") as f:
            f.write(target_info_md)

    print(f"✅ Task created: {task_id}")
    print(f"📁 Project: {project_name}")
    print(f"📁 Directory: {task_dir}")
    print(f"📝 Input: {task_dir}/input.md")
    if target_repo:
        print(f"🎯 Target: {target_repo}")

    return task_id, task_dir, project_name, target_repo

def parse_args(args):
    """Parse task arguments including --target."""
    task_description = []
    target_repo = None

    i = 0
    while i < len(args):
        if args[i] in ("--target", "-t"):
            if i + 1 < len(args):
                target_repo = os.path.expanduser(args[i + 1])
                i += 2
            else:
                print("❌ Error: --target requires a path")
                sys.exit(1)
        else:
            task_description.append(args[i])
            i += 1

    return " ".join(task_description), target_repo

def main():
    if len(sys.argv) < 2:
        print("Usage: python3 init-task.py [task description] --target [repo-path]")
        print()
        print("Examples:")
        print("  python3 init-task.py 'Write login API' --target /path/to/repo")
        print("  python3 init-task.py 'Fix bug' -t ~/projects/api")
        print("  python3 init-task.py 'Refactor auth module'")
        sys.exit(1)

    task_description, target_repo = parse_args(sys.argv[1:])

    if not task_description:
        print("❌ Error: Task description is required")
        sys.exit(1)

    if target_repo and not os.path.exists(target_repo):
        print(f"❌ Error: Target repo path does not exist: {target_repo}")
        sys.exit(1)

    task_id, task_dir, project_name, target = create_task(task_description, target_repo)
    print(f"\n🚀 Next: /workflow tasks/{project_name}/{task_id}")

if __name__ == "__main__":
    main()
