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
4. **Old values get no special case** (phol, 2026-11-26, [spec 10](../../10-repo-kit-and-cleanup/spec.md)): `"quota"` and `"order"` are just paths that fail to load like any other bad ranking value; no message naming a replacement. `makeRanker` goes.
5. **doctor's ranking row is a load check only**: `OK Ranking: balanced (built-in)` or the module path; a value that fails to load fails the row. No quota read for it.

- [ ] Scheduler tests: 0 candidates → none; 1 → no ranker call; 2+ → ranker sees `{ candidates }` only
- [ ] `balanced` and `most-quota` tested as plain functions over candidate tables (ties, `running` weighting, per-model weekly), coin flip pinned with `mock.method(Math, "random", …)`
- [ ] Config/loader rows: built-in names resolve to the files; `./balanced` loads a project file; default `balanced`; existing `tests/fixtures/ranking/` rows stay
- [ ] Doctor rows: built-in, project path, a path that fails to load
