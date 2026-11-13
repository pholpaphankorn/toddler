---
title: providers and ranking config; quota and order rankers drive scheduling
labels: []
blocked_by: [26]
status: closed
---
Replace "Codex always first" with a ranking chosen in config.

1. **Config.**
   ```json
   { "providers": ["claude", "codex"], "ranking": "quota" }
   ```
   - `providers`: the providers this project uses. Default both. Unknown or duplicate names, or an empty list, are config errors. Order means nothing unless `ranking` is `"order"`. Providers not listed are never read, run or reviewed with.
   - `ranking`: `"quota"` (default) or `"order"`. Anything else is a config error (module paths come in the next issue).
2. **Ranker type**, synchronous:
   ```ts
   type Ranker = (input: {
     role: Role; issue: Issue;
     candidates: { provider: Provider; model: string; reading: Reading }[];
   }) => Provider[];   // same candidates, best first
   ```
   toddler drops candidates not available for the role's provider and model first; with one candidate or none the ranker is not called.
3. **Built-ins, both of that type, made from config:**
   - `"order"` closes over `providers`: first listed wins while available.
   - `"quota"` compares weekly left (`weeklyLeft` for the role's model), then five-hour left (no window = 100%), then a fresh random pick per decision. Compare whole points (rounded down: 61.2 and 61.8 tie). The random source is injected so tests are deterministic.
4. **What the ranking decides**, each from the latest refreshed readings:
   - a new job's implementer: the first entry;
   - a `parallel-safe` pair: when both providers are available both run, under either ranking; the first entry takes the first (higher-priority) issue;
   - fallback when a job's implementer is stopped: the first entry.
5. **What it never decides:**
   - **Review** goes to the provider that did not implement whenever it is available; otherwise (stopped, or not in `providers`) the implementer reviews in a fresh session. Every stage keeps its own sandbox and agent with `captureSessions: false`.
   - **Sticky implementer:** later rounds and jobs resumed from `state.json` stay with `job.implementer` while it is available, even if another provider now ranks higher.

Done when tests cover: config errors, `"order"` and `"quota"` ordering (weekly beats five-hour, missing five-hour = 100%, whole-point ties go to the injected random), each of the three decisions, review staying opposite whatever the quota, the one-provider project reviewing itself, and the sticky implementer. README documents `providers` and `ranking`.

Decision records: [20](20-provider-config.md), [21](21-where-ranking-applies.md), [23](23-ranking-extension-point.md).
