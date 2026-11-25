---
title: "What may leave the sandbox, and who pushes it"
labels: [wayfinder:grilling, on-hold]
blocked_by: []
parent: 7
status: open
---
## Question

Today only work that passed host-config `verify` and an approving review leaves, and only the host pushes the exact reviewed SHA. Should that stay, loosen (agent pushes with a forge token, agent runs its own checks, PR opened from inside like Sandcastle 1.0), or go? Inventory rows 20, 22, 24, 27, 28; [What Sandcastle already does that toddler duplicates](60-sandcastle-coverage.md).

From [Unattended runs from a queue](64-unattended-queue.md): a local landing after the base moved is the reviewed commit plus a clean base merge that passed `verify` without re-review, not the exact reviewed SHA. Decide whether that is allowed. The merge fix loop has the host fetch CI logs because sandboxes hold no forge token; revisit if they get one.
