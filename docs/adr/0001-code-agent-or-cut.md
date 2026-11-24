# Toddler keeps as code only what guards, decides deterministically, or is missed

Every toddler feature is sorted by one rule, applied in order:

1. **Trust.** If it guards against the agent (mistakes, drift, untrusted issue text), it stays **code**. An agent can't be its own guard. Whether a given guard exists at all is a separate decision.
2. **Cut.** If phol would not miss it in real use, it is **cut**, whatever it would cost to keep.
3. **Delegate to the agent.** If it needs thinking, doesn't need an exactly repeatable result, and the agent can do it with its own features or with ordinary commands it is told about, it goes to the **agent**. Toddler gives the agent text only: prompts, workflow rules, bundled skills, agent definitions. Where a wrong result would matter, toddler keeps a cheap **check** in code after the fact. Code that duplicates what the agent already does goes, even if it works.
4. **Otherwise**, deterministic work stays **code**.

Token cost only breaks ties. A feature counts as delegated only if every supported provider's agent can do it. Working code is deleted only after one real run inside toddler's sandbox shows the agent doing the job.

We chose this over keeping toddler as a coordinator of agent sessions. Claude Code and Codex already spawn and run subagents, and a one-off check costs far less than coordination code. For example, one session can be told to give each issue its own `git worktree add` branch, and toddler only checks the branches afterwards.

Decided in [Rule for code, harness or cut](../../.sandcastle/specs/7-harness-boundary/issues/61-code-or-harness-rule.md).
