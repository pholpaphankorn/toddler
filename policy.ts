import { providers, type Defaults, type Provider } from "./config.ts";

export interface Issue {
  number: number;
  title: string;
  body?: string | null;
  labels: (string | { name: string })[];
  pull_request?: unknown;
  /** Local issues only. */
  blockedBy?: number[];
  closed?: boolean;
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

// .sandcastle/issues/<number>-<slug>.md, with optional "key: value" frontmatter
// (title, labels: [a, b], blocked_by: [1, 2], status: closed).
export function localIssue(file: string, text: string): Issue {
  const number = Number(/^(\d+)[^/]*\.md$/.exec(file)?.[1]);
  if (!number) throw new Error(`.sandcastle/issues/${file}: name must start with an issue number, e.g. 3-fix-login.md`);
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  const fields: Record<string, string> = {};
  for (const line of match?.[1].split(/\r?\n/) ?? []) {
    const pair = /^(\w+):\s*(.*)$/.exec(line.trim());
    if (pair) fields[pair[1]] = pair[2];
  }
  const list = (value = "") => value.replace(/^\[|\]$/g, "").split(",").map((item) => item.trim()).filter(Boolean);
  const blockedBy = list(fields.blocked_by).map(Number);
  if (blockedBy.some((value) => !Number.isInteger(value))) throw new Error(`.sandcastle/issues/${file}: blocked_by must list issue numbers`);
  return { number, title: fields.title || file.replace(/^\d+-?|\.md$/g, "").replace(/-/g, " ") || `Issue ${number}`,
    body: match ? text.slice(match[0].length) : text, labels: list(fields.labels), blockedBy,
    closed: fields.status?.toLowerCase() === "closed" };
}
