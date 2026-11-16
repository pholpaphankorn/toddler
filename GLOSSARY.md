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

**Project notes**: a project's stack-specific instructions, given to every role.

**Agent**: one provider running one role for one stage. Use it only for that pairing, never to mean the provider or the role alone.

**Stop threshold**: the least quota left, per provider and per window (five-hour or weekly), at which toddler stops using that provider, or that provider for one model, for the rest of a run.
_Avoid_: reserve, limit

**Stop condition**: a check toddler runs on each fresh quota reading that can stop a provider, or that provider for one model, for the rest of a run. The stop thresholds are the built-in one; a project can add its own.
_Avoid_: guard, rule

**Ranking**: the order in which toddler prefers the providers still available for a choice of implementer. Either built in (by quota left, or a fixed preference order) or supplied by the project.
_Avoid_: priority, prioritization

**Spec**: the description of one piece of work and the set of issues that build it.
_Avoid_: map, epic

**Tracker**: where a project's specs and issues live: files in the project, or the forge's own issues (GitHub or GitLab). A remote tracker is always the project's forge.
_Avoid_: issue source, backend

**Forge**: where a project's code is pushed and its pull or merge requests are opened: GitHub, GitLab, or none. Chosen apart from the tracker, so local issues can still open GitHub pull requests.
_Avoid_: remote, host, tracker

**Provider login**: the subscription sign-in toddler holds for one provider, made through toddler and kept apart from the user's own sign-ins to that provider's CLI on the same machine.
_Avoid_: host login, auth, token
