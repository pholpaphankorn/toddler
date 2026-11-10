---
title: How a project plugs in its own stop conditions
labels: [wayfinder:grilling, on-hold]
blocked_by: [22, 23]
parent: 4
status: open
---
## Question

"Stop condition code is extendable": what does a stop condition receive and return (stop / keep going, with a reason for the log?), when is it evaluated (before each stage, every poll, both?), and how do several combine (any one hit stops)? Should it use the same plug-in mechanism the ranking ticket settles on?

From [What weekly usage each provider reports](18-weekly-usage-data.md): Codex returns `ordinaryUsageAllowed`, a backend yes/no flag its source trusts over percentages, which is a candidate built-in stop condition.

From [Weekly and five-hour stop thresholds](22-stop-thresholds.md): built-in thresholds are per provider (`stopAt`), and a hit can stop a whole provider or only one provider and model. A stop lasts for the invocation, but pausing and resuming after a reset is planned as a later effort, so the interface should not rule it out.

From [How a project plugs in its own ranking](23-ranking-extension-point.md): a ranker is chosen by a built-in name or a module path in config (default export, synchronous, checked at startup and in `doctor`, fatal on error), and only ever sees candidates already available, so excluding providers is entirely this ticket's job.
