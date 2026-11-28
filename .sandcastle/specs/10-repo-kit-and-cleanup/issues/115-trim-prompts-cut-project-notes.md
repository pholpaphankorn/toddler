---
title: Trim role prompts and cut project notes
labels: []
blocked_by: []
parent: 10
status: closed
---
Agents get a shorter prompt that keeps only toddler's own workflow, and stack-specific instructions live in the project's `AGENTS.md`/`CLAUDE.md` instead of `.sandcastle/project.md`. Exactly as settled in spec 7's [Role prompts, workflow rules and prompt assembly](../../7-harness-boundary/issues/73-prompts-rules.md).

1. **Role prompts trimmed.** `prompts/implementation.md` and `prompts/review.md` keep only: the issue is the spec; the host runs `verify`; end with a summary plus actual validation evidence and limitations; review the full diff against the exact base SHA, approve only when the issue is met and verification is adequate, report actionable findings. Advice agents follow by default goes ("read the relevant files first", "keep scope focused", "you may delegate bounded subtasks"). `roles.<role>.prompt` stays.
2. **`prompts/rules.md` and the role rules unchanged.**
3. **Project notes cut.** The runner no longer reads `.sandcastle/project.md`; the "Project notes:" section of the prompt goes. This repo's own `.sandcastle/project.md` is deleted (move anything still useful into `AGENTS.md`/`CLAUDE.md`).
4. **`init`'s next steps** stop mentioning `.sandcastle/project.md` and point at `AGENTS.md`/`CLAUDE.md` for stack notes. README follows.

- [ ] Prompt assembly test: no "Project notes" section, even with a `.sandcastle/project.md` present
- [ ] Existing workflow tests pass with the trimmed prompts
- [ ] No mention of `project.md` left in `src/`, README or GLOSSARY
