---
title: Roles in config
labels: [wayfinder:map, adult]
status: closed
---

## Destination

A spec for a config shape where each role (implementation, review, and later pm) declares its prompt, skill set and model per provider, with today's two roles moved onto it without changing their behaviour. The spec is ready to break into toddler issues.

## Notes

- Domain: toddler on `@ai-hero/sandcastle` 0.14.0. Today (2026-11-14): `Role = "implementation" | "review"` in `src/config.ts`; a role's settings are split across `models[provider][role]`, `skills[role]` and a fixed prompt file (`prompts/prompt.md`, `prompts/review.md`, chosen by name in `src/runner.ts`), with `.sandcastle/project.md` appended to both. Spec 4 added `providers`, `ranking`, `stopConditions` and per-provider `stopAt`; `ranked()` in `src/policy.ts` and quota checks read `models[provider][role]`. The workflow itself is hard-coded per role: implementation commits, review returns a `<sandcastle-review>` verdict parsed by the runner, and `skillInstructions` adds a code-review line only for review.
- Builds on spec 1's settled decision [Per-role skill sets](../1-skills-in-the-sandbox/issues/7-role-skill-sets.md) (`skills` keyed by role); not reopened.
- Tracker: these files, same conventions as [spec 1](../1-skills-in-the-sandbox/spec.md). Tickets are files with `parent: 2` and carry `adult` so `toddler` never implements them. Claim = `assignee:`; resolve = `## Answer` + `status: closed`; blocking = `blocked_by` (issue numbers are unique across specs, so cross-spec blocking works).
- Vocabulary: [GLOSSARY.md](../../../GLOSSARY.md) (**Provider**, **Role**, **Agent**, **Tracker**, **Skill set**).
- **Temporary patch: merge after review (2026-11-20):** until the PM role ([spec 5](../5-pm-role/spec.md)) or a dedicated role owns it, a review `approved` verdict now also merges: after opening the PR the coordinator runs `gh pr merge --auto --merge` (`merge()` in `src/runner.ts`), and for a local issue the PR carries a separate `pm: close issue N` commit that sets the file to `status: closed` (`closeCommit()`). The reviewer agent still never merges or closes; this is coordinator code, not role config. If the branch conflicts with the moved base, the implementer merges and resolves it before the reviewer runs (`conflicted()`); the review then diffs against that new base. Each round toddler also re-fetches the base and reads issue files from `origin/<base>`, so it works through this spec's issues (38–40) and spec 3's without a human merging, closing or pulling. Replace all of it when the pm role or `autoMerge` ([#52](../3-trackers/issues/52-automerge-github.md)) lands.
- Spec 1's implementation issues (13–17) and spec 4's (25–29) are all closed, so implementation issues from this spec have no cross-spec blockers today.

## Decisions so far

- [Role config shape](issues/36-role-config-shape.md): `roles.<role>.{skills, models.<provider>}` replaces top-level `models`/`skills` (rejected as obsolete); merges role → field → provider; unknown keys fail at load; `prompt` left to Role prompt override; doctor needs no new checks.
- [Role prompt override](issues/37-role-prompt-override.md): `roles.<role>.prompt` is a project file path that replaces that role's prompt (unset = toddler's `prompts/<role>.md`, `prompt.md` renamed `implementation.md`); workflow rules move to non-overridable `prompts/rules.md` + `prompts/rules/<role>.md`; `project.md` stays shared; fixed assembly order.

## Not yet specified

_Nothing yet._

## Out of scope

- New provider adapters (ruled out when the destinations were named).
- Project-defined roles: only built-in roles are configurable, since a new role needs its own workflow slot and output contract that config can't express (settled while charting, 2026-11-14).
- Defining the pm role itself: this spec only checks the shape fits a third role; pm's prompt, skills and workflow belong to [PM role](../5-pm-role/spec.md).
- Moving role behaviour into config: the review verdict contract, the code-review fixed-point line, `maxReviewRounds` and "implementation commits" stay in code.
- Limiting which providers may run a role: no one needs it yet; every role names a model for every provider (see [Role config shape](issues/36-role-config-shape.md)).
