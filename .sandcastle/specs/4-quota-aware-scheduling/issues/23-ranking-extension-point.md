---
title: How a project plugs in its own ranking
labels: [wayfinder:grilling, on-hold]
blocked_by: [19, 20, 21]
parent: 4
status: open
---
## Question

"Make agent prioritization extendable": what does a ranker receive (providers, their quota readings, the role and issue?) and return (an ordered list? a single pick?), and how does a project choose one: a named built-in in config (`"ranking": "quota"`), a module path under `.sandcastle/`, or code-level extension only inside toddler? The built-in quota ranking and the preference list should both be expressible through the same interface.
