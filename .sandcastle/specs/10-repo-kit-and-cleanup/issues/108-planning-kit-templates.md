---
title: Planning kit templates and the toddler block
labels: [wayfinder:prototype, adult]
blocked_by: []
parent: 10
status: closed
assignee: claude (phol session)
---
## Question

What exactly does `setup` write for each tracker, so a planning session outside toddler produces specs and issues toddler picks up? Draft, for phol to react to:

1. `.sandcastle/templates/spec.md` and `issue.md` for the **files** tracker (frontmatter `title`, `labels`, `blocked_by`, `parent`, `status`), **GitHub** (parent issue + sub-issues + native blocking, with the `gh` commands that create and wire them) and **GitLab** (`Spec: #<iid>` / `Blocked by: #<iid>` lines, with the `glab` commands). Label names come from config (`issueLabel`, `parallelLabel`, `blockedLabels`): which placeholders, and is the template rendered once or kept with placeholders?
2. The text between `<!-- toddler:start -->` and `<!-- toddler:end -->`: when an agent should use the templates, and how short it can be.

Settled in [doctor, setup, init, plan and smoke](../../7-harness-boundary/issues/72-cli-modes.md): configured tracker only, marker rules, where the block goes. Link the drafts as an asset; don't paste them here.

## Answer

Resolved with phol 2026-11-28 by reacting to drafts. Drafts: `.sandcastle/specs/10-repo-kit-and-cleanup/prototype-108-kit/` on local branch `prototype/planning-kit-templates` (commit `59e747d`, not pushed, never merged).

1. **Body shape follows the mattpocock skills.** `spec.md` uses to-spec's sections (Problem Statement, Solution, User Stories, Implementation Decisions, Testing Decisions, Out of Scope, Further Notes). `issue.md` uses to-tickets' issue template (Parent, What to build, Acceptance criteria, Blocked by), with Blocked by omitted where blockers are stored outside the body. The files spec keeps a `# <title>` heading, since toddler reads the title from it.
2. **toddler's needs replace the skills' tracker steps:**
   - `Sandcastle` (`issueLabel`) where the skills say `ready-for-agent`; the spec carries neither.
   - Files: toddler's `.sandcastle/specs/<n>-<slug>/issues/<n>-<slug>.md` path with numbers unique across all specs (not `.scratch/…/01-…`), frontmatter `title`/`labels`/`blocked_by`/`parent`/`status`, `## Parent` links `../spec.md`.
   - GitHub: spec is a plain issue; each issue created with `--label Sandcastle`, attached as a sub-issue and wired with native `blocked_by`, via `gh api` (works on the installed gh 2.88.1; no gh ≥ 2.94 requirement).
   - GitLab: `Spec: #<iid>` under `## Parent`, `Blocked by: #<iid>, …` under `## Blocked by` (the section goes when there are none), created with `glab issue create --label Sandcastle`.
   - Each template says how to use `parallel-safe` and how `blocked`/`on-hold` hold an issue back.
3. **Rendered, not placeholdered.** `setup` writes the configured label names into the templates and rewrites them on every run. Only `<…>` holes for the planning agent remain. Usage notes sit in an HTML comment at the top of each template, which the agent deletes after copying.
4. **The toddler block is about three lines.** toddler builds this repo's issues. Use `.sandcastle/templates/spec.md` and `issue.md` (by hand or with to-spec / to-tickets), and they take priority over the skills' own tracker steps. An issue not written that way is never picked up. Then a note that `toddler setup` overwrites the text between the markers.

Not verified: the `gh api` sub-issue/blocking commands and the `glab` commands were not run, and no to-spec/to-tickets session has been run against the templates.
