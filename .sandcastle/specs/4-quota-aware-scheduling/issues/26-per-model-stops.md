---
title: Per-model stops: a provider can be stopped for one model only
labels: []
blocked_by: [25, 14, 15]
parent: 4
status: open
---
Availability becomes per **provider and model**, so a per-model weekly bucket can stop one model while the provider stays usable for roles on other models.

- **Weekly per model.** On every refresh, for each model a role runs on that provider (from `models`), check `weeklyLeft(reading, model)` against `stopAt.<provider>.weekly`. A hit only on a `weeklyByModel` bucket stops that provider and model: its active sessions on that model are cancelled, sessions on other models keep running. A hit on the all-models `weekly`, or on `fiveHour`, still stops the whole provider.
- **Availability checks use the role's model.** Choosing an implementer, falling back when it stops, and choosing a reviewer check the model that role runs on that provider (implementation model, review model). A job is never moved to another model; with nothing available for its role, it pauses as today.
- **Stays stopped** for the invocation, like whole-provider stops. A job cancelled by a stop counts as attempted.
- **Run end.** The run stops when no provider is available for any role. `toddler plan` shows stops per provider and model.

Done when tests with fake readings cover: a Fable-style bucket at the threshold stops only that model's role (e.g. review stops, implementation on the same provider carries on), its in-flight session is aborted while another model's is not, an all-models weekly hit stops the provider, and the run ending when nothing is left.

Decision records: [21](21-where-ranking-applies.md), [22](22-stop-thresholds.md).
