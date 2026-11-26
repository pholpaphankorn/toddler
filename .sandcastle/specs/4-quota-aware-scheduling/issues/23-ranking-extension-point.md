---
title: How a project plugs in its own ranking
labels: [wayfinder:grilling, on-hold]
blocked_by: [19, 20, 21]
parent: 4
assignee: claude (with user)
status: closed
---
## Question

"Make agent prioritization extendable": what does a ranker receive (providers, their quota readings, the role and issue?) and return (an ordered list? a single pick?), and how does a project choose one: a named built-in in config (`"ranking": "quota"`), a module path under `.sandcastle/`, or code-level extension only inside infant? The built-in quota ranking and the preference list should both be expressible through the same interface.

From [Which scheduling choices the ranking drives](21-where-ranking-applies.md): a ranker is consulted only for a new job's implementer, the order of a parallel pair, and the fallback when an implementer stops, never for review. It runs per decision and must rank by availability of the provider **and the role's model**.

## Answer

**Choosing one:** `ranking` is `"quota"`, `"order"`, or a path (relative to the project root) to a module whose default export is a ranker, e.g. `"ranking": ".sandcastle/ranking.ts"`. Not a shell command (a process per decision plus a JSON contract), not infant-internal only.

**Interface**, synchronous, no `Promise`:

```ts
type Ranker = (input: {
  role: Role;
  issue: Issue;
  candidates: { provider: Provider; model: string; reading: Reading }[];
}) => Provider[];
```

- **Input:** infant first drops candidates not available for the role's provider and model, so a ranker never sees a stopped provider and never checks availability. With one candidate or none, the ranker is not called. The input does not say which of the three decisions is being made; they ask the same question.
- **Output:** the same candidates, best first. Not a permutation of the input = error. Excluding providers is the stop conditions' job ([How a project plugs in its own stop conditions](24-stop-condition-extension-point.md)), not the ranker's.
- **Use:** implementer and fallback take the first entry; a parallel pair gives the first issue to the first entry and the second issue to the second.

**Built-ins are rankers of the same type**, made from config: `"order"` closes over `providers`, `"quota"` over its random source (so tests inject it). A custom ranker gets only the input above, no config.

**Failure is fatal:** the module path and its default export are checked at startup and in `doctor`; a ranker that throws or returns a bad list stops the run with an error naming the module. No silent fallback to `"quota"`.

**Not exported:** infant exports no helpers (`quotaRanking`, `weeklyLeft`) for custom rankers to wrap; composition is left in the map's fog.
