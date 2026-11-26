---
title: Issue-tracker setup for code-review in the sandbox
labels: [wayfinder:grilling, on-hold]
blocked_by: []
parent: 1
assignee: phol (with claude)
status: closed
---
## Question

`code-review` is in the default review set, and it looks for `docs/agents/issue-tracker.md` (written by `/setup-matt-pocock-skills`) to fetch the spec. Infant already hands the reviewer the issue text and the base SHA. Do we tell the reviewer to use those and skip the tracker lookup (prompt wording), seed a sandbox-only tracker doc in HOME, or require target projects to have run the setup?

## Answer

- **Review-stage line.** When `code-review` is in the review set, infant adds one generated line: "For code-review: the fixed point is `<baseSha>`; the spec is the issue text in this prompt. Do not look up an issue tracker." There is no tracker doc in the sandbox and no `/setup-matt-pocock-skills` requirement on target projects.
- **Why not read `.sandcastle/` from the worktree.** The worktree is cut from the base SHA, so local issue files may be missing or stale (they are often uncommitted). In GitHub mode, `gh` has no token in the sandbox. Infant's host-side copy of the issue, already in the prompt, is the authoritative one.
- **One verdict.** code-review's Standards/Spec findings feed infant's single `<sandcastle-review>` verdict as `findings` strings. `review.md`'s format still governs.
- **Planning mode.** A tracker doc generated from `.sandcastle/config.json` (local → `.sandcastle/specs/` format) is moved to Out of scope. Tracker-writing skills in the planning mode need it.
