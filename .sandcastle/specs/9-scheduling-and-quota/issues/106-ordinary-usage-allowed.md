---
title: Codex ordinaryUsageAllowed as a built-in stop
labels: [parallel-safe]
blocked_by: [102, 104]
parent: 9
status: open
---
When Codex's backend says ordinary usage is not allowed, toddler stops Codex even if the percentages still show quota left, so it never loops on refusals or spends paid credits.

1. **`Reading` gains `allowed: boolean | null`**: Codex fills it from `ordinaryUsageAllowed`; Claude and a Codex reading without the flag give `null`. Project stop conditions see it through the `Reading` they already get.
2. **Built-in stop condition, always on**, no config: `allowed: false` stops Codex provider-wide (no model). Registered before the threshold condition; if both fire they share one stop.
3. **Lifts** on the first fresh reading whose `allowed` is `true` or `null`. A poll that finds `false` cancels every live Codex session. `wakeAt` unchanged (30 min recheck).
4. **Wording**: reason `provider reports ordinary usage not allowed`; log `[quota] codex stopped: provider reports ordinary usage not allowed`.

- [ ] `codexUsage` table rows: flag `true`, `false`, missing → `null`; Claude readings always `null`
- [ ] Scheduler tests: `false` stops Codex; `null` and `true` lift it; a poll finding `false` aborts Codex signals only
