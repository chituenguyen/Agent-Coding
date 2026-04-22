#!/usr/bin/env python3
"""
workflow-orchestrator.py — Generate agent prompts và print commands

ĐÂY LÀ TEMPLATE - Để thật sự spawn agents, cần gọi Agent() tool trong Claude Code.

Cách hoạt động thực tế:
1. User nói "chạy workflow"
2. Main Claude session spawns agents bằng Agent() tool
3. Agents là subprocess riêng của Claude Code

Script này chỉ generate prompts và state để agents đọc.
"""

import os
import sys
from datetime import datetime
from pathlib import Path

AGENT_CODING_PATH = "/Users/tue.nc/Desktop/agent-coding"
TASKS_PATH = f"{AGENT_CODING_PATH}/tasks"
AGENTS_PATH = f"{AGENT_CODING_PATH}/.claude/agents"

def generate_architect_prompt(task_id):
    """Generate prompt cho Architect agent"""
    task_dir = f"{TASKS_PATH}/{task_id}"

    # Read task input
    input_path = f"{task_dir}/input.md"
    input_content = ""
    if os.path.exists(input_path):
        with open(input_path) as f:
            input_content = f.read()

    # Read target info
    target_path = f"{task_dir}/target-info.md"
    repo_path = ""
    repo_rules = ""
    if os.path.exists(target_path):
        with open(target_path) as f:
            content = f.read()
            for line in content.split('\n'):
                if '**Path:**' in line:
                    repo_path = line.split('**Path:**')[1].strip()

    prompt = f"""# ARCHITECT AGENT

## Soul
"Designing systems is my passion"

## Task ID
{task_id}

## Task Input
{input_content}

## Target Repository
Path: {repo_path}

---

## YOUR TASK

1. Analyze the task requirements above
2. Design the system architecture
3. Write SPEC.md to: {task_dir}/SPEC.md

## SPEC.md Requirements

Your SPEC.md must include:

### 1. System Architecture
- Overview of what will be built
- Components and their relationships
- Data flow

### 2. File Structure
- All files to be created
- Directory structure

### 3. Implementation Details
- Tech stack (based on repo rules or task requirements)
- Dependencies
- Configuration
- API design (if applicable)

### 4. Acceptance Criteria
- What defines "done" for this task
- How to verify the implementation

## After completing SPEC.md

Write your deliverable to: {task_dir}/SPEC.md
"""

    return prompt

def generate_coder_prompt(task_id):
    """Generate prompt cho Coder agent"""
    task_dir = f"{TASKS_PATH}/{task_id}"

    # Read SPEC
    spec_content = ""
    spec_path = f"{task_dir}/SPEC.md"
    if os.path.exists(spec_path):
        with open(spec_path) as f:
            spec_content = f.read()

    # Read target info
    target_path = f"{task_dir}/target-info.md"
    repo_path = ""
    if os.path.exists(target_path):
        with open(target_path) as f:
            content = f.read()
            for line in content.split('\n'):
                if '**Path:**' in line:
                    repo_path = line.split('**Path:**')[1].strip()

    prompt = f"""# CODER AGENT

## Soul
"Clean, efficient code is art"

## Task ID
{task_id}

## Target Repository
{repo_path if repo_path else "Using workspace default"}

---

## YOUR TASK

1. Read SPEC.md from: {spec_path}
2. Implement the code according to SPEC

## Implementation Instructions

### Code Location
- If target repo exists: Write directly to {repo_path}
- If no target: Write to {task_dir}/code/

### Follow Conventions
- Use the file naming and structure from repo rules
- Follow NestJS module patterns if applicable
- Use proper TypeScript/JavaScript conventions

### Files to Create
Based on SPEC.md, create all necessary files:

1. Source code files
2. Configuration files
3. Docker files (if specified)
4. Tests (if specified)

### After Implementation

1. Write summary to: {task_dir}/review/code-summary.md
   - List all files created
   - Any notes about implementation

2. Write summary to: {task_dir}/review/code-summary.md
"""

    return prompt

def generate_reviewer_prompt(task_id):
    """Generate prompt cho Reviewer agent"""
    task_dir = f"{TASKS_PATH}/{task_id}"

    # Read SPEC
    spec_content = ""
    spec_path = f"{task_dir}/SPEC.md"
    if os.path.exists(spec_path):
        with open(spec_path) as f:
            spec_content = f.read()

    # Read target info
    target_path = f"{task_dir}/target-info.md"
    repo_path = ""
    if os.path.exists(target_path):
        with open(target_path) as f:
            content = f.read()
            for line in content.split('\n'):
                if '**Path:**' in line:
                    repo_path = line.split('**Path:**')[1].strip()

    prompt = f"""# REVIEWER AGENT

## Soul
"Code quality is non-negotiable"

## Task ID
{task_id}

## Target Repository
{repo_path if repo_path else "Using workspace default"}

## SPEC.md
{spec_content if spec_content else "SPEC.md not found - check task directory"}

---

## YOUR TASK

1. Read the code from target repo or {task_dir}/code/
2. Read SPEC.md to understand what should be built

## Review Checklist

### Standards Compliance
- [ ] File naming follows conventions
- [ ] Code structure is logical
- [ ] No obvious code smells

### Correctness
- [ ] Code matches SPEC.md
- [ ] Logic is correct
- [ ] Edge cases handled

### Security
- [ ] No hardcoded secrets
- [ ] Input validation present
- [ ] No obvious vulnerabilities

### Quality
- [ ] Code is readable
- [ ] Comments explain complex logic
- [ ] Error handling present

## Decision

### If APPROVED (code is good):
Write to: {task_dir}/review/approval.md

Include:
- List of files reviewed
- Approval status
- Any notes

### If ISSUES FOUND:
Write to: {task_dir}/review/issues.md

Include:
- Detailed list of issues
- What needs to be fixed
- Suggested fixes (if applicable)
"""

    return prompt

def generate_debugger_prompt(task_id):
    """Generate prompt cho Debugger agent"""
    task_dir = f"{TASKS_PATH}/{task_id}"

    issues_path = f"{task_dir}/review/issues.md"
    issues_content = ""
    if os.path.exists(issues_path):
        with open(issues_path) as f:
            issues_content = f.read()

    # Read target info
    target_path = f"{task_dir}/target-info.md"
    repo_path = ""
    if os.path.exists(target_path):
        with open(target_path) as f:
            content = f.read()
            for line in content.split('\n'):
                if '**Path:**' in line:
                    repo_path = line.split('**Path:**')[1].strip()

    prompt = f"""# DEBUGGER AGENT

## Soul
"Bugs fear me"

## Task ID
{task_id}

## Issues to Fix
{issues_content if issues_content else "No issues file found"}

## Target Repository
{repo_path if repo_path else "Using workspace default"}

---

## YOUR TASK

1. Read the issues from: {issues_path}
2. Find the problematic code
3. Fix the issues
4. Verify fixes don't break other functionality

## Fix Process

1. For each issue in issues.md:
   - Understand the problem
   - Find the root cause
   - Apply fix
   - Verify fix works

2. Write fix log to: {task_dir}/review/fix-log.md
   - What was fixed
   - How it was fixed

## Important

- Fix root cause, not symptoms
- Don't introduce new bugs
- Keep code clean
"""

    return prompt

def main():
    if len(sys.argv) < 2:
        print("""
╔══════════════════════════════════════════════════════════╗
║          WORKFLOW ORCHESTRATOR TEMPLATE                  ║
╠══════════════════════════════════════════════════════════╣
║                                                          ║
║  This script generates prompts for agents.               ║
║  To actually spawn agents, use Agent() tool in           ║
║  Claude Code main session.                               ║
║                                                          ║
║  Usage:                                                  ║
║    python3 workflow-orchestrator.py architect [task-id]  ║
║    python3 workflow-orchestrator.py coder [task-id]      ║
║    python3 workflow-orchestrator.py reviewer [task-id]   ║
║    python3 workflow-orchestrator.py debugger [task-id]   ║
║                                                          ║
║  Example:                                                ║
║    python3 workflow-orchestrator.py architect 20260421-xxx ║
║                                                          ║
╚══════════════════════════════════════════════════════════╝
""")
        sys.exit(1)

    agent = sys.argv[1]
    task_id = sys.argv[2] if len(sys.argv) > 2 else None

    if not task_id:
        print("❌ Error: Task ID required")
        sys.exit(1)

    if agent == "architect":
        prompt = generate_architect_prompt(task_id)
        print(prompt)
    elif agent == "coder":
        prompt = generate_coder_prompt(task_id)
        print(prompt)
    elif agent == "reviewer":
        prompt = generate_reviewer_prompt(task_id)
        print(prompt)
    elif agent == "debugger":
        prompt = generate_debugger_prompt(task_id)
        print(prompt)
    else:
        print(f"❌ Unknown agent: {agent}")
        print("Available: architect, coder, reviewer, debugger")
        sys.exit(1)

if __name__ == "__main__":
    main()