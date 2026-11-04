export type Provider = "codex" | "claude";
export type Role = "implementation" | "review";
export const providers: Provider[] = ["codex", "claude"];

const config = {
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
  } satisfies Record<Provider, Record<Role, string>>,
  codexLimitId: "codex",
};
export type Config = typeof config;
export default config;
