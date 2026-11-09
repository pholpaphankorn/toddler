# Glossary

**Bundled skill**: a skill that ships inside toddler itself and is available to sandboxed agents on any machine toddler is installed on. Toddler bundles only the skills it uses, plus every skill those refer to. Never read from the host user's own skill or plugin folders.
_Avoid_: host skill, installed skill

**Skill set**: the bundled skills a role is given for one stage, all loaded explicitly when the stage starts. Two roles working the same issue can have different skill sets.
_Avoid_: skill profile, allowlist

**Provider**: a coding-agent CLI and the subscription that pays for it, e.g. Claude Code or Codex. Each provider has its own usage limits.
_Avoid_: agent, vendor, model

**Role**: a job in toddler's workflow (implementation, review, pm). A role decides what a provider is asked to do in a stage and with which prompt, skill set and model.
_Avoid_: agent, persona

**Agent**: one provider running one role for one stage. Use it only for that pairing, never to mean the provider or the role alone.

**Tracker**: where a project's specs and issues live: local files, GitHub or GitLab.
_Avoid_: issue source, backend
