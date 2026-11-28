---
title: How toddler's prompts trigger skills
labels: [wayfinder:grilling, adult]
blocked_by: []
parent: 1
assignee: phol (with claude)
status: closed
---
## Question

Beyond the agreed no-human line, what do `prompt.md` and `review.md` say to make an agent use skills from its set, e.g. "use the ponytail skill" for implementation and "use ponytail-review" for review? Is that wording fixed in toddler, derived from the role's skill set (so a project's override changes it), or left to `.sandcastle/project.md`? How should the same wording read for Claude (`/name` or by name) and Codex (`$name` or by name)?

## Answer

_Revised: the user chose explicit loading over implicit invocation._

- **The skill set is the load list.** At stage start, every skill in the role's set is loaded explicitly. Only those are linked, so nothing is left for implicit pickup. A skill not wanted every stage comes out of the set. The defaults stay as decided, `diagnosing-bugs` included.
- **Provider-specific load line.** Toddler generates one per stage and appends it to the prompt:
  - **Codex:** path-qualified explicit mentions, e.g. `Load these skills: [$tdd](<path>/SKILL.md) [$ponytail](<path>/SKILL.md)`. An explicit mention bypasses `allow_implicit_invocation: false`, and the path qualification still resolves when a project skill shares the name (a plain `$name` would load neither).
  - **Claude:** `Before doing anything else, read and follow these skill files: <path>/tdd/SKILL.md, ...`. The same mechanism serves every skill, so `disable-model-invocation: true` doesn't matter. This loses nothing: no vendored skill uses `${CLAUDE_SKILL_DIR}`, `$ARGUMENTS` or `` !`cmd` ``, and permissions are already skipped.
- **Ponytail.** No fixed ponytail lines in `prompt.md`/`review.md`. Ponytail loads because it is in the set.
- **User-invoked-only skills** (wayfinder, implement, triage...) may go in any set and are loaded the same way. Doctor does not warn about invocation flags. Human-waiting behaviour is covered by the no-human line and is the project's call.
- **Unverified.** Codex `$name` via stdin is inferred from source, and Claude following a read-file instruction reliably is untested. The canary smoke uses this exact generated line to prove both.
