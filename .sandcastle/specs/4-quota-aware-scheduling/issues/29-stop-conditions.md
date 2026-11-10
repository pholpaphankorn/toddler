---
title: Built-in thresholds as a stop condition, plus stopConditions modules
labels: []
blocked_by: [26, 28]
parent: 4
status: open
---
Make stopping extensible the same way as ranking.

1. **Interface**, synchronous:
   ```ts
   type StopCondition = (input: {
     provider: Provider;
     reading: Reading;
     models: string[]; // the models roles run on this provider
   }) => { reason: string; model?: string }[];
   ```
   Empty = keep going. No `model` stops the whole provider; `model` (must be in `models`) stops only that provider and model. `reason` is logged and kept.
2. **Built-in.** Rewrite the `stopAt` thresholds as a stop condition of this type, made from `stopAt`. It always runs and cannot be removed; setting values to 0 turns them off. Behaviour stays as it is.
3. **Config.** Optional `"stopConditions": [".sandcastle/stop.ts"]`, module paths relative to the project root, each default-exporting a stop condition. Loaded and checked (startup and `doctor`) the same way as a custom ranker.
4. **When.** On every quota refresh, right after a valid reading. Never for a provider already stopped, nor for an unverifiable reading (that already stops it).
5. **Combining.** All run: built-in first, then the project's in config order. Every returned stop is applied; stopping something already stopped is a no-op and the first reason is kept.
6. **Failure is fatal:** a throw, a `Promise`, not an array, an empty reason, or a `model` not in `models` stops the run with an error naming the module. No fail-safe "stop this provider".

Done when tests cover: the built-in still producing today's stops, a custom whole-provider stop, a custom per-model stop, ordering and first-reason-kept, skipping stopped providers and unverifiable readings, each fatal case, and `doctor` reporting the modules. README documents `stopConditions` with a minimal example.

Decision records: [22](22-stop-thresholds.md), [24](24-stop-condition-extension-point.md).
