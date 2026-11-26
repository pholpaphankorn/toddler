---
title: How plan and doctor explain a ranking or a stop
labels: [wayfinder:prototype, on-hold]
blocked_by: [91, 94]
parent: 9
status: closed
assignee: claude
---
## Question

What should `toddler plan` print to preview which provider each ready issue's next stage would get and why (scores, `running`, stops and when they lift), and what should `doctor`'s ranking row show? Make a rough text mock-up of both outputs to react to.

## Answer

Settled with phol 2026-11-26 against a text mock-up (prototype: branch `prototype/95-plan-doctor-explain`, `src/PROTOTYPE-plan-doctor-output.md`; layout A).

- **`toddler plan` prints human text by default**; today's JSON moves behind `--json`, kept for scripts.
- **Three sections**: *Providers* (per provider: 5h and weekly left with reset times, `running`; each stop with its key, reason and how it lifts: threshold → "lifts when a reading is above N%" plus the window's reset, limit failure → "held until <time>", failed read → "recheck on next read"); *Slots* (`n of maxParallelIssues free` and which issues hold them); *Next stages* under `ranking: <name>`, one line per ready issue or waiting job: issue, title, stage (and round), then `→ provider (model)` or `—` with why it won't start.
- **Picked provider only**, not the ranker's full order. Candidates the ranker never saw are named with why (`codex stopped for gpt-5`).
- **Plan fills slots like a run**: same fill order as the loop (merge fixes, waiting jobs, fresh issues), `admit` and `running` count earlier picks in the same pass, so later lines show `not started: no free slot` or `waits: not parallel-safe, #88 running`. Dry run only: no job is created and every `release()` runs before plan exits.
- **Sleep line**: `Would sleep: no` or `Would sleep until 14:05 (<per-stop reasons>)`, the same `wakeAt` and wording as the run log in [Sleeping until the next reset](92-wake-at.md).
- **No ranker reasons**: the contract stays `{ candidates } → order` for every ranker, built-in or project; plan shows the inputs and the outcome, and the reader works out why.
- **doctor's ranking row is a load check only** (`OK Ranking: balanced (built-in)` / path for a project module; old `"quota"`/`"order"` fail with the replacement named). No quota read for it, no dry run; stops stay in the existing per-provider quota rows.
