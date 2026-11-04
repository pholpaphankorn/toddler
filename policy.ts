import { providers, type Defaults, type Provider } from "./config.ts";

export interface Issue {
  number: number;
  title: string;
  body?: string | null;
  labels: (string | { name: string })[];
  pull_request?: unknown;
}
export interface ReviewReport {
  verdict: "approved" | "changes_requested";
  findings: string[];
  summary: string;
  validation: string;
}
export type Available = (provider: Provider) => boolean;
export interface Assignment { issue: Issue; provider: Provider }

export function labels(issue: Issue): string[] { return issue.labels.map((label) => typeof label === "string" ? label : label.name); }
export function ready(issue: Issue, config: Defaults): boolean {
  return !labels(issue).some((label) => config.blockedLabels.includes(label.toLowerCase()));
}
export function assignments(issues: Issue[], available: Available, config: Defaults): Assignment[] {
  const candidates = issues.filter((issue) => ready(issue, config));
  const usable = providers.filter((provider) => available(provider));
  if (!candidates.length || !usable.length) return [];
  const result = [{ issue: candidates[0], provider: usable[0] }];
  if (usable.length === 2 && labels(candidates[0]).includes(config.parallelLabel)) {
    const next = candidates.slice(1).find((issue) => labels(issue).includes(config.parallelLabel));
    if (next) result.push({ issue: next, provider: usable[1] });
  }
  return result;
}
export function reviewer(implementer: Provider, available: Available): Provider | undefined {
  const opposite = implementer === "codex" ? "claude" : "codex";
  return available(opposite) ? opposite : available(implementer) ? implementer : undefined;
}
export function reviewReport(text: string): ReviewReport {
  const matches = [...text.matchAll(/<sandcastle-review>([\s\S]*?)<\/sandcastle-review>/g)];
  if (matches.length !== 1) throw new Error("Review must contain exactly one structured verdict");
  const value = JSON.parse(matches[0][1]);
  if (!["approved", "changes_requested"].includes(value.verdict) ||
      !Array.isArray(value.findings) || !value.findings.every((entry: unknown) => typeof entry === "string") ||
      typeof value.summary !== "string" || typeof value.validation !== "string" ||
      (value.verdict === "approved" && value.findings.length) ||
      (value.verdict === "changes_requested" && !value.findings.length)) throw new Error("Invalid review verdict");
  return value;
}
