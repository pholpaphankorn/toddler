---
title: How config lists and orders providers
labels: [wayfinder:grilling, adult]
blocked_by: []
parent: 4
assignee: claude (with user)
status: closed
---
## Question

The goal asks for (a) choosing which providers a project uses and (b) a simple preference list like `[claude, codex]`, plus (c) a default ranking by quota left. Is (a) the same key as (b), so listing a provider enables it and its position sets preference? When a preference list is set, does it replace quota ranking entirely, or act as a tie-break, or only apply while both providers are above some threshold? What happens with no list: quota ranking only?

From [What weekly usage each provider reports](18-weekly-usage-data.md): both providers have per-model weekly buckets (Codex extra `limitId`s with `normalModelSlug`, Claude `weekly_scoped` rows). Is "weekly left" chosen per provider, or per the model the role runs?

## Answer

Two config keys:

```json
{ "providers": ["claude", "codex"], "ranking": "quota" }
```

- **`providers`**: which providers this project uses. Default: both. Order in this list means nothing unless `ranking` is `"order"`. Unknown or duplicate names, or an empty list, are config errors.
- **`ranking`**: `"quota"` (default) or `"order"`. This is the key [How a project plugs in its own ranking](23-ranking-extension-point.md) extends.
- **`"order"` is strict preference**: the first listed provider gets every job while it is available (not stopped by a threshold); the next one takes over only then. Quota still matters through the stop thresholds.
- **`"quota"`** compares, in order:
  1. **Weekly left**: the tighter of the all-models weekly and the weekly bucket for the model the role will run.
  2. **Five-hour left**: a provider with no five-hour window (Codex Pro, Claude Ultra) counts as 100%.
  3. **Random**: a fresh pick for each decision, not one per run.
  Numbers are compared in **whole percentage points** (rounded down), so 61.2 and 61.8 tie.
