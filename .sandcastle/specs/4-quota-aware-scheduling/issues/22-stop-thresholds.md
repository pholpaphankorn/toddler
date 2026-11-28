---
title: Weekly and five-hour stop thresholds
labels: [wayfinder:grilling, adult]
blocked_by: [19]
parent: 4
assignee: claude (with user)
status: closed
---
## Question

The goal says config has stop thresholds for both weekly and five-hour usage, and hitting either stops. Does a hit stop **that provider** (today's behaviour: the other one carries on) or the **whole run**? Are thresholds global or per provider? Are they "percent left" like `reservePercent`, and does `reservePercent` become the five-hour threshold or go away? What should the default weekly threshold be?

From [What weekly usage each provider reports](18-weekly-usage-data.md): a missing five-hour window (Codex Pro, Claude Ultra) must mean "no five-hour limit", not "usage unverifiable". Today `seven_day_oauth_apps` can wrongly stop Claude, while the Fable `weekly_scoped` limit is missed.

## Answer

**What stops:** a threshold hit stops **that provider** only (today's behaviour). Its active sessions are cancelled, the other provider carries on, and the run ends when no enabled provider is left. With one provider in `providers`, that is the whole run.

**Config**, per provider, replacing `reservePercent` (removed, no migration):

```json
{ "stopAt": { "claude": { "weekly": 20 }, "codex": { "fiveHour": 10 } } }
```

- Values are **percent left**; a reading **at or below** the threshold stops.
- Every field is optional. Defaults: `fiveHour` **5**, `weekly` **10** (weekly also covers the user's own use for days, so it keeps more back).
- Values must be finite numbers from 0 to 100. An unknown provider key is a config error. A key for a provider not in `providers` is allowed and has no effect.

**What is checked:**

- **Five-hour:** `reading.fiveHour` against `stopAt.<provider>.fiveHour`. A hit stops the whole provider.
- **Weekly:** `weeklyLeft(reading, model)` (see [The shape of a quota reading](19-quota-reading-shape.md)) against `stopAt.<provider>.weekly`, for each model a role runs on that provider. A hit on the all-models `weekly` stops the provider. A hit only on a `weeklyByModel` bucket stops **that provider and model**: its sessions are cancelled and jobs needing that model go elsewhere, while roles on other models keep using the provider.
- A missing window counts as 100% left, so it never triggers a stop.
- An unverifiable reading stops the provider, as today.

**Stays stopped:** a stopped provider, or provider and model, stays stopped for the rest of the invocation even if its window resets. A job cancelled by a stop counts as attempted and is not scheduled again in this invocation (today's behaviour).

**Out of scope:** pausing and resuming after a reset, including re-queueing cancelled work, is left for a later effort (see the map's Out of scope).
