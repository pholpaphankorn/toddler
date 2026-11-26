---
title: A project's own ranker as a module
labels: []
blocked_by: [27]
status: closed
---
Let a project plug in its own ranking without changing infant.

- **Config.** `ranking` may also be a path, relative to the project root, to a module whose default export is a `Ranker` (same type as the built-ins), e.g. `"ranking": ".sandcastle/ranking.ts"`. Not a shell command.
- **Input.** Exactly the built-in input: role, issue, and only the available candidates with their readings. No config. Called only with two or more candidates; the input does not say which decision is being made.
- **Checked at startup and in `doctor`:** the file exists and its default export is a function. Failure stops before any stage, naming the module.
- **Failure is fatal:** a ranker that throws, returns a `Promise`, or returns anything that is not a permutation of the candidates' providers stops the run with an error naming the module. No silent fallback to `"quota"`.
- **Not exported:** infant exports no helpers for custom rankers to wrap.

Done when tests with fixture modules cover: a custom ranker driving an implementer choice, a missing file, a non-function default export, a throw, a dropped / duplicated / unknown provider, and the not-called-with-one-candidate rule; `doctor` reports the module. README shows a minimal example ranker.

Decision record: [23](23-ranking-extension-point.md).
