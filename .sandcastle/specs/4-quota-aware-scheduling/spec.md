---
title: Quota-aware scheduling
labels: [wayfinder:map, on-hold]
status: open
---
<!-- Wayfinder map. Tickets are files in issues/ with `parent: 4`. All carry `on-hold` so `toddler` never tries to implement them. -->

## Destination

A spec for how toddler chooses providers by quota: config lists the enabled providers and an optional preference order; by default the provider with more weekly quota left goes first, then more five-hour quota left, then random; a run stops on configurable weekly and five-hour thresholds (whichever is hit first); ranking and stop conditions are both extensible. The spec is ready to break into toddler issues.

## Notes

- Domain: toddler on `@ai-hero/sandcastle` 0.14.0. Today [quota.ts](../../../src/quota.ts) reads only the five-hour remaining %, with weekly as an "exhausted" flag; `reservePercent` (5) is the only stop threshold; [policy.ts](../../../src/policy.ts) `assignments` always tries Codex first, and `reviewer` picks the other provider.
- Known bugs this spec must fix, not fix separately (user's call): weekly-only plans (Codex Pro, Claude Ultra) are disabled for lacking a five-hour window; Claude's weekly check counts `seven_day_oauth_apps` and misses `weekly_scoped` limits. See [What weekly usage each provider reports](issues/18-weekly-usage-data.md).
- Supported providers stay Claude Code and Codex. The code is extensible for ranking and stop conditions, not for new provider adapters.
- Tracker: these files, same conventions as [spec 1](../1-skills-in-the-sandbox/spec.md). Claim = `assignee:` frontmatter; resolve = `## Answer` section + `status: closed`; blocking = `blocked_by` (works across specs).
- Vocabulary: [GLOSSARY.md](../../../GLOSSARY.md) (**Provider**, **Role**, **Agent**).
- Skills for every session: grilling and domain-modeling (HITL tickets), research (research tickets), codebase-design for the extension-point tickets.
- Implementation issues from this spec are `blocked_by` [spec 1](../1-skills-in-the-sandbox/spec.md)'s open issues (13–17) where they touch the same code.

## Decisions so far

- [What weekly usage each provider reports](issues/18-weekly-usage-data.md): Codex weekly = window with `windowDurationMins`≈10080 in primary *or* secondary, per-model buckets as extra `limitId`s; Claude weekly = `seven_day` (per-model Fable weekly is a `limits[]` `weekly_scoped` row, not `seven_day_*`); five-hour can be absent (Codex Pro, Claude Ultra); Claude endpoint undocumented.

- [How config lists and orders providers](issues/20-provider-config.md): `providers` (enabled, default both) + `ranking`: `"quota"` (default: tighter weekly incl. role-model bucket, then 5h with no-window = 100%, then per-decision random; whole points) or `"order"` (strict preference).

- [The shape of a quota reading](issues/19-quota-reading-shape.md): `Reading` = `{ observedAt, fiveHour, weekly, weeklyByModel }`, null window = no limit (100%); `weeklyLeft(reading, model)` takes the tighter; Claude from `limits[]` only, Codex main bucket fixed to `"codex"` (`codexLimitId` removed), windows by duration; override commands print a `Reading`, old shape rejected. Prototype is replaced outright: no fallbacks, no migration.

- [Weekly and five-hour stop thresholds](issues/22-stop-thresholds.md): per-provider `stopAt: { <provider>: { fiveHour, weekly } }` in percent left (defaults 5 / 10), replacing `reservePercent`; a hit stops that provider, or only that provider and model for a per-model weekly bucket; stopped stays stopped for the invocation.
- [Which scheduling choices the ranking drives](issues/21-where-ranking-applies.md): ranking picks a new job's implementer, orders a parallel pair (both providers still run, even under `"order"`), and picks the fallback when an implementer stops; review always goes to the other provider when available (else same provider, fresh session); implementer is sticky per job; computed per decision, checked per provider and role model.

## Not yet specified

- How `toddler plan` and `doctor` explain why a provider was ranked first or stopped.
- How tests pin the random tie-break (seeded or injected).
- Whether a role can be limited to certain providers, and how that combines with ranking (shared with [Roles in config](../2-roles-in-config/spec.md)).

## Out of scope

- New provider adapters.
- Provider-enforced spending caps: the polling guard's limits (README "Five-hour reserve and stopping") stay as they are.
- Pausing a stopped provider and resuming it after its window resets, including re-queueing work a stop cancelled: user's call to add later as its own effort ([Weekly and five-hour stop thresholds](issues/22-stop-thresholds.md)).
