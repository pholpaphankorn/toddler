---
title: Weekly and five-hour stop thresholds
labels: [wayfinder:grilling, on-hold]
blocked_by: [19]
parent: 4
status: open
---
## Question

The goal says config has stop thresholds for both weekly and five-hour usage, and hitting either stops. Does a hit stop **that provider** (today's behaviour: the other one carries on) or the **whole run**? Are thresholds global or per provider? Are they "percent left" like `reservePercent`, and does `reservePercent` become the five-hour threshold or go away? What should the default weekly threshold be?

From [What weekly usage each provider reports](18-weekly-usage-data.md): a missing five-hour window (Codex Pro, Claude Ultra) must mean "no five-hour limit", not "usage unverifiable". Today `seven_day_oauth_apps` can wrongly stop Claude, while the Fable `weekly_scoped` limit is missed.
