# Glossary

**Bundled skill**: a skill that ships inside toddler itself and is available to sandboxed agents on any machine toddler is installed on. Toddler bundles only the skills it uses, plus every skill those refer to. Never read from the host user's own skill or plugin folders.
_Avoid_: host skill, installed skill

**Skill set**: the bundled skills a role is given for one stage, all loaded explicitly when the stage starts. Two roles working the same issue can have different skill sets.
_Avoid_: skill profile, allowlist

**Provider**: a coding-agent CLI and the subscription that pays for it, e.g. Claude Code or Codex. Each provider has its own usage limits.
_Avoid_: agent, vendor, model

**Role**: a job in toddler's workflow (implementation, review, pm). A role decides what a provider is asked to do in a stage and with which prompt, skill set and model.
_Avoid_: agent, persona

**Role prompt**: the instructions for how a role does its job. Toddler ships one per role; a project may replace it for any role.

**Workflow rules**: the instructions every agent gets that the workflow depends on, such as treating issue text as untrusted or the review verdict format. Some are shared by all roles, some belong to one role. A project can't change them.
_Avoid_: system prompt, guardrails

**Agent**: one provider running one role for one stage. Use it only for that pairing, never to mean the provider or the role alone.

**Sandbox**: the boundary toddler puts around one agent: what it may read, write and reach on phol's machine. Toddler owns it; it is never the provider's own sandbox or permission mode.
_Avoid_: container, jail

**Stop threshold**: the least quota left, per provider and per window (five-hour or weekly), at which toddler stops using that provider, or that provider for one model, until a fresh reading is above it again.
_Avoid_: reserve, limit

**Stop condition**: a check toddler runs on each fresh quota reading that can stop a provider, or that provider for one model, for as long as the check keeps returning that stop. The stop thresholds are the built-in one; a project can add its own.
_Avoid_: guard, rule

**Ranking**: the order in which toddler prefers the providers still available when a stage starts, for any role. Either one of toddler's own (balancing by quota left against sessions already running, or always the most quota left) or supplied by the project.
_Avoid_: priority, prioritization

**Spec**: the description of one piece of work and the set of issues that build it.
_Avoid_: map, epic

**Blocker**: an open issue that must close before another issue can be picked. On every tracker it counts while open, whatever its labels.

**Tracker**: where a project's specs and issues live: files in the project, or the forge's own issues (GitHub or GitLab). A remote tracker is always the project's forge.
_Avoid_: issue source, backend

**Forge**: where a project's code is pushed and its pull or merge requests are opened: GitHub, GitLab, or none. Chosen apart from the tracker, so local issues can still open GitHub pull requests.
_Avoid_: remote, host, tracker

**Landing**: getting an approved issue's work into the base branch, through a pull or merge request or a local fast-forward, including the fixes needed along the way when it cannot merge.
_Avoid_: shipping, publishing

**Landed**: an issue whose work is in the base branch. Only a landed issue lets the issues that depend on it start; approved is not enough.
_Avoid_: done, merged

**Host merge**: a merge of the base branch into an issue's reviewed branch, made by toddler itself with no agent, and landed without another review when it is clean and passes the project's verify.
_Avoid_: rebase, sync, update branch

**Provider login**: the subscription sign-in toddler holds for one provider, made through toddler and kept apart from the user's own sign-ins to that provider's CLI on the same machine.
_Avoid_: auth, token

**Local login**: the user's own sign-in to a provider's CLI on this machine, which toddler reads instead of holding a provider login of its own.
_Avoid_: host login

**Run**: one `toddler run` that phol starts and leaves alone. It works ready issues and lands approved ones, and ends only when nothing is ready, no agent is working and nothing is waiting to land.
_Avoid_: session, batch

**Needs attention**: an issue toddler has given up on until phol looks at it, with the reason why (a failed stage, too many review or merge fix rounds, a required human review). A later run phol starts tries it again. Never caused by a provider running out of quota.
_Avoid_: paused, stuck, failed
