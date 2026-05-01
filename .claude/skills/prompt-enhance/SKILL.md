---
name: prompt-enhance
description: Takes a vague task or bug description and a target repo, explores the codebase, and rewrites the description into a precise, actionable technical prompt. Use when acting as the Prompt Enhancer agent.
user-invocable: false
---

# Prompt Enhance Skill

## Purpose

Turn a vague user description into a specific, actionable technical prompt by exploring the target codebase — the reverse of the Investigator skill.

- **Investigator**: specific symptom → trace code → root cause
- **Prompt Enhancer**: vague description → explore code → precise prompt

## Inputs

- `description` — what the user typed (can be vague, non-technical)
- `targetRepo` — absolute path to the codebase to explore
- `mode` — `task` (build/fix something) or `investigate` (find a bug)

## Steps

### Step 1 — Parse intent

Identify the domain from the description:
- Is it a UI issue? → look for component/page files
- An API issue? → look for routes, controllers, services
- A data issue? → look for models, queries, migrations
- A bug? → look for error-prone logic, recent changes

### Step 2 — Explore the codebase (targeted)

Search and read only what is relevant:

```
1. Grep for keywords from the description (feature name, error message, UI element)
2. Read entry points that match: route files, page components, service files
3. Follow the relevant call chain 1-2 levels deep
4. Note: exact file paths, function/component names, API routes, data shapes
```

Stop after 2-3 files — do not audit the whole codebase.

### Step 3 — Decide

**If enough context found → rewrite:**
- Include the exact file path(s) involved
- Name the specific function, component, or endpoint
- Describe the expected behavior based on what you read
- Keep it one paragraph, under 3 sentences

**If still ambiguous → ask:**
- Ask 1-3 targeted questions based on what you found
- Make questions specific to the codebase (e.g. "Is this about the `LoginForm` in `src/auth/` or the `SSOForm`?")
- Never ask generic questions like "what do you mean?"

### Step 4 — Output

Respond ONLY with valid JSON:

```json
{
  "action": "rewrite" | "ask",
  "result": "rewritten prompt string" | ["question 1", "question 2"],
  "explanation": "one sentence: what you found or what is still unclear"
}
```

## Rewrite Quality Bar

A good rewrite must include:
- **What**: specific action (fix, add, refactor)
- **Where**: file path or component/function name found in the codebase
- **Expected**: what correct behavior looks like

### Example

Input: `"the button doesn't work"`

After finding `src/components/CheckoutForm.tsx` with a `handleSubmit` function:

```json
{
  "action": "rewrite",
  "result": "Fix the Submit button in src/components/CheckoutForm.tsx — clicking it calls handleSubmit() but the POST /api/orders request is never sent. Expected: form validates inputs and submits the order on click.",
  "explanation": "Found CheckoutForm.tsx with a handleSubmit handler that appears to exit early before the fetch call."
}
```

## Key Behavior

- **Read only, never modify** — this skill is read-only exploration
- **Stay scoped** — follow the description's trail, not the whole codebase
- **Be specific** — a rewrite without file paths is not good enough
- **Ask smart questions** — if unsure, ask questions that reference what you found
