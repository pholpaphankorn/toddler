---
title: How a project plugs in its own stop conditions
labels: [wayfinder:grilling, on-hold]
blocked_by: [22, 23]
parent: 4
status: closed
assignee: claude
---
## Question

"Stop condition code is extendable": what does a stop condition receive and return (stop / keep going, with a reason for the log?), when is it evaluated (before each stage, every poll, both?), and how do several combine (any one hit stops)? Should it use the same plug-in mechanism the ranking ticket settles on?

From [What weekly usage each provider reports](18-weekly-usage-data.md): Codex returns `ordinaryUsageAllowed`, a backend yes/no flag its source trusts over percentages, which is a candidate built-in stop condition.

From [Weekly and five-hour stop thresholds](22-stop-thresholds.md): built-in thresholds are per provider (`stopAt`), and a hit can stop a whole provider or only one provider and model. A stop lasts for the invocation, but pausing and resuming after a reset is planned as a later effort, so the interface should not rule it out.

From [How a project plugs in its own ranking](23-ranking-extension-point.md): a ranker is chosen by a built-in name or a module path in config (default export, synchronous, checked at startup and in `doctor`, fatal on error), and only ever sees candidates already available, so excluding providers is entirely this ticket's job.

## Answer

**Choosing them:** the built-in stop thresholds (`stopAt`, see [Weekly and five-hour stop thresholds](22-stop-thresholds.md)) always run and cannot be removed; setting their values to 0 turns them off. A project adds its own with an optional `stopConditions` list of module paths (relative to the project root), each with a stop condition as its default export, e.g. `"stopConditions": [".sandcastle/stop.ts"]`. Modules load the same way as a custom ranker ([How a project plugs in its own ranking](23-ranking-extension-point.md)).

**Interface**, synchronous, no `Promise`:

```ts
type StopCondition = (input: {
  provider: Provider;
  reading: Reading;
  models: string[]; // the models roles run on this provider
}) => { reason: string; model?: string }[];
```

- **Input:** one provider's fresh reading. No config, role or issue: a stop applies to a provider (or provider and model), not a job.
- **Output:** a list of stops; empty = keep going. No `model` stops the whole provider; `model` (must be one of `models`) stops only that provider and model. `reason` is logged and kept as the stop reason.
- **Built-in thresholds are a stop condition of the same type**, made from `stopAt`; one reading can hit several model buckets, hence a list.

**When:** on every quota refresh (before each stage and every poll), right after a valid reading, where `reservePercent` is checked today. Never for a provider already stopped, nor for an unverifiable reading (that already stops the provider).

**Combining:** all conditions run, built-in thresholds first, then the project's in config order. Every returned stop is applied, so any one hit stops. Stopping something already stopped is a no-op; the first reason is the one kept.

**Failure is fatal:** the path and default export are checked at startup and in `doctor`. A throw or bad output (not an array, empty reason, model not in `models`) stops the run with an error naming the module. No fail-safe "stop this provider", which would look like real exhaustion and hide bugs.

**Not now:**
- Codex `ordinaryUsageAllowed` is not added to `Reading`, so no condition can see it; left in the map's fog.
- No "until"/"resume at" field. A later pause-and-resume effort can add an optional field to the stop object without breaking existing conditions.
