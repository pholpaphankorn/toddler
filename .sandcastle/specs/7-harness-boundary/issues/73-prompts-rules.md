---
title: "Role prompts, workflow rules and prompt assembly: what stays toddler's"
labels: [wayfinder:grilling, on-hold]
blocked_by: []
parent: 7
status: closed
assignee: claude
---
## Question

Prompt assembly stays code ([Rule for code, harness or cut](61-code-or-harness-rule.md), row 34). Open: which of the role prompts and workflow rules in [prompts/](../../../../prompts/) toddler still needs to own, versus what the providers' agents already do by default or a project's own CLAUDE.md/AGENTS.md covers? The review verdict format stays a workflow rule ([One provider builds, the other reviews](66-cross-provider-review.md)). Inventory rows 21, 34.

## Answer

Resolved 2026-11-25 with phol (grilling). Prompt assembly stays code; what it assembles shrinks.

- **Role prompts: kept and trimmed.** `prompts/implementation.md` and `prompts/review.md` keep only the lines specific to toddler's workflow: the issue is the spec, the host runs `verify`, end with a summary plus actual validation evidence and limitations; review the full diff against the exact base SHA, approve only when the issue is met and verification is adequate, report actionable findings. Advice agents already follow by default is cut ("read the relevant files first", "keep scope focused", "you may delegate bounded subtasks"). The per-role override `roles.<role>.prompt` stays.
- **Shared workflow rules (`prompts/rules.md`): kept unchanged.** Untrusted issue text/comments/diffs; never push, merge, close issues, open PRs or edit state (kept even though sandboxes hold no forge token: it saves wasted turns); wait for subagents before committing, they share quota; no human available, pick the recommended option and list the choices. A project still can't change them.
- **Role rules kept.** Implementation: the agent commits its finished work (the host does not take this over; it already commits formatter output separately). Review: no edits or commits, the verdict block, as decided in [One provider builds, the other reviews](66-cross-provider-review.md).
- **Project notes cut.** `.sandcastle/project.md` and the "Project notes:" section of the prompt go. Stack-specific instructions live in the project's own `AGENTS.md` / `CLAUDE.md`, which Claude Code and Codex already read from the worktree (toddler launches neither with flags that skip them) and where `init` writes its toddler block ([doctor, setup, init, plan and smoke](72-cli-modes.md)). Workflow rules are in the prompt itself and take precedence over anything those files say (e.g. "open a PR when done"). `init`/README point at `AGENTS.md`/`CLAUDE.md` instead; toddler's own one-line notes ("run `npm run format`") is already done by the host.
- **Merge fix rounds: no new role prompt.** They reuse the implementation role prompt and rules; the host's conflict note or failing CI names + log tails are appended like review feedback, marked as untrusted data like issue text. The reviewer gets one line saying it is a merge fix round, with the merge commit to review.
