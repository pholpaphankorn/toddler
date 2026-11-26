---
title: plan explains rankings and stops
labels: []
blocked_by: [100, 101, 103, 105, 106]
parent: 9
status: open
---
`infant plan` shows in plain text what a run would do next and why: which provider each stage would get, which are stopped and how they lift, which slots are full, and whether the run would sleep.

1. **Text by default**; today's JSON moves behind `--json`.
2. **Providers**: per provider 5h and weekly left with reset times and `running`; each stop with its key, reason and how it lifts: threshold → "lifts when a reading is above N%" plus the window's reset; limit failure → "held until <time>"; failed read → "recheck on next read"; ordinary usage → "lifts when a reading allows it; recheck on next read".
3. **Slots**: `n of maxParallelIssues free` and which issues hold them.
4. **Next stages** under `ranking: <name>`: one line per ready issue or waiting job: issue, title, stage (and round), then `→ provider (model)` or `—` with why it won't start (`not started: no free slot`, `waits: not parallel-safe, #88 running`, `codex stopped for gpt-5`). Picked provider only, no ranker order or reasons.
5. **Fills slots like a run**: same fill order, `admit` and `running` count earlier picks in the pass. Dry run: no job created, every `release()` runs before plan exits.
6. **Sleep line**: `Would sleep: no` or `Would sleep until 14:05 (<per-stop reasons>)`, same `wakeAt` and wording as the run log.

- [ ] Exact-text tests with `TZ=UTC` over fixed scenarios: each stop kind with its lift line, a full slot, a non-`parallel-safe` wait, would-sleep yes and no
- [ ] One `--json` shape test
- [ ] After plan, every provider's `running` is 0
