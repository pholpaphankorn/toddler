---
title: roles.<role>.prompt overrides a role's prompt
labels: []
blocked_by: [38, 39]
parent: 2
status: closed
---
Let a project replace a built-in role's prompt without being able to drop the workflow rules.

1. **Config.** `prompt` joins the known fields of a role: `roles.<role>.prompt` is the path to a Markdown file, relative to the project root (e.g. `".sandcastle/prompts/review.md"`). Inline text is not accepted.
2. **Effect.** The file replaces toddler's `prompts/<role>.md` for that role only; other roles keep theirs. Unset means the bundled prompt, and defaults name no path. There is no "append to default" mode.
3. **Rules still apply.** The rules files, project notes, skill instructions and issue context are added after the override in the same order as before.
4. **Validation at load.** A `prompt` that is not a non-empty string, or that points to a missing or empty file, fails naming `roles.<role>.prompt`. `doctor` gets this through `loadConfig`; no new check.

Done when tests show:
- an override replaces only its own role's prompt
- the rules files and `project.md` are still added after it
- unset uses the bundled prompt
- each validation error

The README documents `roles.<role>.prompt` and links the bundled prompt files to copy from.

Decision record: [37](37-role-prompt-override.md).
