---
title: Role prompt override
labels: [wayfinder:grilling, on-hold]
blocked_by: [36]
parent: 2
status: open
---
## Question

How does a project change a built-in role's prompt? Today `Runner.prompt` in `src/runner.ts` reads toddler's `prompts/prompt.md` or `prompts/review.md` and appends `.sandcastle/project.md` to both.

Options: replace toddler's prompt, append per-role notes (like `project.md`, but for one role), or both. Toddler's prompts carry rules the workflow depends on: issue text is untrusted, never push or close issues, and review's `<sandcastle-review>` verdict contract that the runner parses. Does an override ever get to drop those? Does `project.md` stay shared across roles alongside per-role notes, and where do per-role notes live (a path in [Role config shape](36-role-config-shape.md)'s `prompt`, or a file convention)?

## Answer
