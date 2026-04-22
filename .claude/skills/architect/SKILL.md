---
name: architect
description: System architecture design and SPEC.md writing. Use when acting as the Architect agent — analyzing requirements, designing architecture, producing detailed specifications.
user-invocable: false
---

# Architect Skill

## Purpose

Analyze requirements and design system architecture. Runs at Stage 1 in parallel with Researcher.

## Steps

### Step 1: Read and Analyze

```
1. Read tasks/[task-id]/input.md
2. If target repo exists:
   - Read target-info.md to get path
   - Read repo directly: package.json, tsconfig, go.mod, requirements.txt...
   - Understand existing structure, naming conventions, tech stack
3. Identify: core functionality, data requirements, external dependencies, constraints
```

### Step 2: Design Architecture

```
1. Choose architectural pattern that fits existing stack
2. Define components and relationships
3. Define data models and schema
4. Design API endpoints
```

### Step 3: Write SPEC.md

Create `tasks/[task-id]/SPEC.md`:

```markdown
# System Specification

## Overview
[Short description]

## Architecture
[Text diagram]

## Data Models
[Entity definitions + schema]

## API Endpoints
[Method, path, request/response]

## File Structure
[Directory tree with all files to create]

## Dependencies
[Packages to install]

## Acceptance Criteria
- [ ] Criteria 1
- [ ] Criteria 2
```

## Output

- `tasks/[task-id]/SPEC.md` — detailed enough for Coder to implement without asking questions

## Checklist Before Done

- [ ] All sections present in SPEC.md
- [ ] File structure is specific (no placeholders)
- [ ] API endpoints have request/response format
- [ ] Dependencies fully listed
- [ ] Acceptance criteria are measurable
