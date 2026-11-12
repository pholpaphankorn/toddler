---
title: toddler smoke proves each provider loads skills
labels: []
blocked_by: [14, 15]
status: closed
---
Prove for real that Codex and Claude load skills from inside Seatbelt using toddler's exact mechanism.

In `scripts/smoke-agents.ts`:
- Write a **canary skill** to a temp dir: a `SKILL.md` whose body holds a fresh random code each run. It is a test fixture, not in `vendor/skills`.
- Mount that dir read-only and link the canary the same way real stages do.
- Replace the current smoke prompt with the **same generated load line** real stages use (Codex path-qualified `$name`, Claude "read and follow these skill files"), naming only the canary. Ask for READY plus the code. The code must never appear in the prompt.
- Pass only when the reply contains READY and the code.
- On failure, print e.g. `claude: skills not discovered inside Seatbelt (symlinked skills ignored or -p --bare?); fall back to copy-in`.
- Keep the call count unchanged: one per provider and role.

The human runs `toddler smoke` on the host; it needs subscription auth and spends a little quota. If a provider fails, a follow-up issue switches that provider to copying skills in with tar over exec stdin.

Decision records: `.sandcastle/specs/1-skills-in-the-sandbox/issues/9-skill-load-checks.md`, `.sandcastle/specs/1-skills-in-the-sandbox/issues/6-skill-delivery.md`.
