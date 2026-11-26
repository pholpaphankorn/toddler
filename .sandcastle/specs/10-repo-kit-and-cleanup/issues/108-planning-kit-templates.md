---
title: Planning kit templates and the toddler block
labels: [wayfinder:prototype, on-hold]
blocked_by: []
parent: 10
status: open
---
## Question

What exactly does `setup` write for each tracker, so a planning session outside toddler produces specs and issues toddler picks up? Draft, for phol to react to:

1. `.sandcastle/templates/spec.md` and `issue.md` for the **files** tracker (frontmatter `title`, `labels`, `blocked_by`, `parent`, `status`), **GitHub** (parent issue + sub-issues + native blocking, with the `gh` commands that create and wire them) and **GitLab** (`Spec: #<iid>` / `Blocked by: #<iid>` lines, with the `glab` commands). Label names come from config (`issueLabel`, `parallelLabel`, `blockedLabels`): which placeholders, and is the template rendered once or kept with placeholders?
2. The text between `<!-- toddler:start -->` and `<!-- toddler:end -->`: when an agent should use the templates, and how short it can be.

Settled in [doctor, setup, init, plan and smoke](../../7-harness-boundary/issues/72-cli-modes.md): configured tracker only, marker rules, where the block goes. Link the drafts as an asset; don't paste them here.
