# Glossary

**Bundled skill**: a skill that ships inside toddler itself and is available to sandboxed agents on any machine toddler is installed on. Toddler bundles only the skills it uses, plus every skill those refer to. Never read from the host user's own skill or plugin folders.
_Avoid_: host skill, installed skill

**Skill set**: the bundled skills a role is given for one stage, all loaded explicitly when the stage starts. Two roles working the same issue can have different skill sets.
_Avoid_: skill profile, allowlist
