---
title: setup writes and commits the planning kit
labels: []
blocked_by: [118]
parent: 10
status: open
---
`toddler setup` makes a repo ready for planning sessions outside toddler: it writes the configured tracker's templates and a toddler block in `AGENTS.md`/`CLAUDE.md`, and commits only what changed. Settled in [Planning kit templates and the toddler block](108-planning-kit-templates.md), [setup as a toddler command](109-setup-command.md) (steps 5–7) and [How spec 10's setup, kit and doctor row are tested](114-testing-spec-10.md). Drafts to start from: `prototype-108-kit/` on local branch `prototype/planning-kit-templates` (commit `59e747d`, unverified).

1. **`setup` becomes a TypeScript command in `main.ts`.** No config → stops with "run `toddler init` first". Order for now: kit → commit → today's `scripts/setup.sh` logins → `doctor` (the login steps move to TypeScript in the next ticket).
2. **Templates**: `.sandcastle/templates/spec.md` and `issue.md` for the configured tracker only (files, GitHub, GitLab), shaped as in 108: to-spec sections / to-tickets issue template, toddler's paths, frontmatter and blocker format, `gh api` / `glab` commands. **Rendered** with the configured `issueLabel`, `parallelLabel`, `blockedLabels` and `adultLabel` (the issue template's line: label `<adultLabel>` when a person, not toddler, should do it); rewritten each run. Usage notes in a top HTML comment.
3. **The toddler block** (~3 lines, as in 108) between `<!-- toddler:start -->` and `<!-- toddler:end -->`, in whichever of `AGENTS.md`/`CLAUDE.md` exists (both if both); neither → `AGENTS.md` with the block plus `CLAUDE.md` holding `@AGENTS.md`. A pure splice function: no block → appended; one pair → only text between markers replaced; start without end, end without start, or two pairs → error naming the file, and `setup` stops before writing or committing anything.
4. **Commit rule**: each kit file is written only when its content differs; then `git commit --only -- <kit paths git status reports changed>`, message `toddler: set up planning kit`. A kit file with uncommitted edits from before the run is written but left out, with `<file>: has your uncommitted edits, commit it yourself`. Detached HEAD → `detached HEAD: kit written, not committed`. Any branch.
5. **Output**: `kit: wrote …`, `kit: committed <sha> (toddler: set up planning kit)` or `kit: up to date`.
6. README describes the kit; Glossary **Planning kit** matches.

- [ ] Splice table (pure function): every row in step 3
- [ ] Process tests spawning `main.ts setup` in temp git repos (`forge: none`, file issues, fake `bin/` on `PATH` so logins and doctor stay offline): first run writes and commits; second run `kit: up to date`, no commit; `issueLabel`/`adultLabel: grown-up` change re-renders and commits only changed templates; prior uncommitted edit left out with its line; other staged changes stay staged and out of the commit; detached HEAD writes without committing; interrupted commit finished by the next run; neither agent file → `AGENTS.md` + `CLAUDE.md` `@AGENTS.md`; both present → both get the block; bad markers stop `setup` with nothing written
- [ ] Rendered label names (including `adultLabel`) asserted in the templates for each tracker
