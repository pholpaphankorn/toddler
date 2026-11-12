---
title: Load each role's skills explicitly from the stage prompt
labels: [parallel-safe]
blocked_by: [13]
status: closed
---
Every skill in the role's set is loaded explicitly at stage start; nothing relies on implicit invocation. Extend the prompt built by `Runner.prompt`/`context` in `src/runner.ts`:

1. **Generated load line, per provider**, listing every skill in the role's set (paths point at the vendored skill folder):
   - Codex: path-qualified explicit mentions, e.g. `Load these skills: [$tdd](<path>/SKILL.md) [$ponytail](<path>/SKILL.md)`.
   - Claude: `Before doing anything else, read and follow these skill files: <path>/tdd/SKILL.md, ...`.

   No line when the set is empty.
2. **No-human line** in both `prompts/prompt.md` and `prompts/review.md`: "No human is available during this stage. Where a skill says to ask the user or wait for an answer, pick the recommended option yourself and list each such choice in your summary."
3. **code-review line.** When `code-review` is in the review set, add: "For code-review: the fixed point is `<baseSha>`; the spec is the issue text in this prompt. Do not look up an issue tracker." Its findings must still end up in the single `<sandcastle-review>` verdict, which `prompts/review.md` already requires.

Done when tests with the existing fake agents (`tests/workflow.test.ts`) assert:
- the Codex and Claude load lines for a given set;
- the empty-set case;
- the no-human line;
- the code-review line, present only when that skill is in the set.

Decision records: `.sandcastle/specs/1-skills-in-the-sandbox/issues/10-prompt-skill-triggers.md`, `.sandcastle/specs/1-skills-in-the-sandbox/issues/11-tracker-setup-for-skills.md`.
