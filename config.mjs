export default {
  repository: "pholpaphankorn/nvchad-starter",
  remote: "origin",
  issueLabel: "Sandcastle",
  parallelLabel: "parallel-safe",
  blockedLabels: ["blocked", "on-hold"],
  reservePercent: 5,
  pollIntervalMs: 15_000,
  quotaTimeoutMs: 12_000,
  maxReviewRounds: 3,
  models: {
    codex: { implementation: "gpt-6.1-terra", review: "gpt-6.1-sol" },
    claude: { implementation: "claude-sonnet-5-5", review: "claude-opus-5-5" },
  },
  codexLimitId: "codex",
};
