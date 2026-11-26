---
title: Ranker contract, balanced and most-quota built-ins, doctor ranking row
labels: [parallel-safe]
blocked_by: [99]
parent: 9
status: open
---
Rankers decide only between real choices, see how busy each provider already is, and the two built-in strategies are ordinary ranker files any project could have written.

1. **Contract**: input is `{ candidates: [{ provider, model, reading, running }] }` only; `role` and `issue` are dropped with no shim. The output permutation check stays. Candidates are configured providers with a reading, not stopped for that role's model.
2. **When the ranker is called**: 0 candidates → none, no call; 1 → that provider, no call. A project module only ever sees 2+.
3. **Built-ins as files**: `balanced` (default) and `most-quota` ship as files with a default export against the public contract, loaded through the same `loadRanker` path and validation. The exact names `"balanced"`/`"most-quota"` resolve to them; anything else is a project-relative path (`./balanced` for a project file). Strategies as settled in spec 7's provider split (#69).
4. **Old values**: `"ranking": "quota"` and `"order"` are config-load errors naming the replacement (`"balanced"`/`"most-quota"`; `order` removed, write a module). `makeRanker` goes.
5. **doctor's ranking row is a load check only**: `OK Ranking: balanced (built-in)` or the module path; old values fail with the replacement named. No quota read for it.

- [ ] Scheduler tests: 0 candidates → none; 1 → no ranker call; 2+ → ranker sees `{ candidates }` only
- [ ] `balanced` and `most-quota` tested as plain functions over candidate tables (ties, `running` weighting, per-model weekly), coin flip pinned with `mock.method(Math, "random", …)`
- [ ] Config/loader rows: `"quota"`/`"order"` fail naming the replacement; built-in names resolve to the files; `./balanced` loads a project file; default `balanced`; existing `tests/fixtures/ranking/` rows stay
- [ ] Doctor rows: built-in, project path, old value failing
