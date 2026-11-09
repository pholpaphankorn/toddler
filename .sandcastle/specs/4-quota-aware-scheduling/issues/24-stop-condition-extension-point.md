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
