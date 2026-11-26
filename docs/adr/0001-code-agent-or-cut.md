# Infant keeps as code only what guards, decides deterministically, or is missed

Every infant feature is sorted by one rule, applied in order:

1. **Trust.** If it guards against the agent (mistakes, drift, untrusted issue text), it stays **code**. An agent can't be its own guard. Whether a given guard exists at all is a separate decision.
2. **Cut.** If phol would not miss it in real use, it is **cut**, whatever it would cost to keep.
3. **Delegate to the agent.** If it needs thinking, doesn't need an exactly repeatable result, and the agent can do it with its own features or with ordinary commands it is told about, it goes to the **agent**. Infant gives the agent text only: prompts, workflow rules, bundled skills, agent definitions. Where a wrong result would matter, infant keeps a cheap **check** in code after the fact. Code that duplicates what the agent already does goes, even if it works.
4. **Otherwise**, deterministic work stays **code**.

Token cost only breaks ties. A feature counts as delegated only if every supported provider's agent can do it. Working code is deleted only after one real run inside infant's sandbox shows the agent doing the job.

Scheduling is not delegated: infant keeps one provider session per issue and runs several issues in parallel itself. A provider's subagents only help inside one issue; see [One orchestrator session per batch or one session per issue](../../.sandcastle/specs/7-harness-boundary/issues/62-orchestrator-session.md).

Decided in [Rule for code, harness or cut](../../.sandcastle/specs/7-harness-boundary/issues/61-code-or-harness-rule.md).
