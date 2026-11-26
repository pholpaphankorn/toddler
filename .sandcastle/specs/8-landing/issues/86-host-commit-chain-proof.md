---
title: Host-commit chain proof and the files-tracker close commit
labels: []
blocked_by: [85]
parent: 8
status: closed
---
Nothing reaches the base or a PR branch that was neither reviewed nor provably made by the host.

1. **Close commit**: right after approval, when the issue's file in `reviewedSha` is not already `status: closed` (files tracker only), the host adds one commit on `reviewedSha` that sets it. Message `Close local issue N`, host git identity. If an agent reverted it in a later round, the host adds it again. Forge-tracked issues get none. It lands with the work, so a files-tracked issue on a forge closes when its PR merges.
2. **Chain proof before every `deliver`**: walking first-parent from the SHA about to be delivered down to `reviewedSha`, the chain must be
   - at most one close commit directly on `reviewedSha`, whose tree equals the one the host builds from `reviewedSha` with that file set to `closed`;
   - then zero or more host merges (`Merge <base> into toddler/issue-N`): exactly two parents, the second an ancestor of the base, tree identical to `git merge-tree --write-tree <p1> <p2>`.
   Proven by recomputing trees, never by trusting authors or trailers. Anything else refuses the publish → needs attention `refused`.
3. Replaces however the close is done today in `publish`.

- [ ] Real temp repo tests: close commit added once; not added when already closed; re-added after a revert; a chain of two host merges passes; a foreign commit in the chain refuses the publish; a hand-edited merge (tree differs from `merge-tree`) refuses

Decision record: [76](76-landing-path.md).
