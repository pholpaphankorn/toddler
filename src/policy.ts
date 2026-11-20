import { type Defaults, type Provider, type Role } from "./config.ts";
import { weeklyLeft, type Reading, type Quotas } from "./quota.ts";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export type Ranker = (input: {
  role: Role;
  issue: Issue;
  candidates: { provider: Provider; model: string; reading: Reading }[];
}) => Provider[];

export class RankingError extends Error {}

export async function loadRanker(
  root: string,
  config: Defaults,
): Promise<Ranker> {
  if (config.ranking === "quota" || config.ranking === "order")
    return makeRanker(config);
  const name = config.ranking;
  let ranker: Ranker;
  try {
    const module = await import(pathToFileURL(resolve(root, name)).href);
    if (typeof module.default !== "function")
      throw new Error("default export must be a function");
    ranker = module.default;
  } catch (error) {
    throw new RankingError(
      `Ranking module ${name}: ${(error as Error).message}`,
    );
  }
  return (input) => {
    const expected = input.candidates.map(({ provider }) => provider);
    try {
      const result = ranker(input);
      if (result instanceof Promise) void result.catch(() => {});
      if (
        !Array.isArray(result) ||
        result.length !== expected.length ||
        new Set(result).size !== expected.length ||
        result.some((provider) => !expected.includes(provider))
      )
        throw new Error(
          "must return a permutation of candidate providers synchronously",
        );
      return result;
    } catch (error) {
      throw new RankingError(
        `Ranking module ${name}: ${String((error as Error)?.message ?? error)}`,
      );
    }
  };
}

export function makeRanker(
  config: Defaults,
  random: () => number = Math.random,
): Ranker {
  return ({ candidates }) => {
    if (config.ranking === "order")
      return config.providers.filter((provider) =>
        candidates.some((c) => c.provider === provider),
      );
    const [a, b] = candidates;
    const weekly =
      Math.floor(weeklyLeft(b.reading, b.model, b.provider)) -
      Math.floor(weeklyLeft(a.reading, a.model, a.provider));
    const fiveHour =
      Math.floor(b.reading.fiveHour?.remainingPercent ?? 100) -
      Math.floor(a.reading.fiveHour?.remainingPercent ?? 100);
    return weekly > 0 ||
      (weekly === 0 && (fiveHour > 0 || (fiveHour === 0 && random() >= 0.5)))
      ? [b.provider, a.provider]
      : [a.provider, b.provider];
  };
}

export function ranked(
  issue: Issue,
  role: Role,
  config: Defaults,
  quotas: Quotas,
  ranker: Ranker = makeRanker(config),
): Provider[] {
  const candidates = config.providers.flatMap((provider) => {
    const model = config.models[provider][role];
    const reading = quotas.values.get(provider);
    return reading && quotas.available(provider, model)
      ? [{ provider, model, reading }]
      : [];
  });
  return candidates.length < 2
    ? candidates.map((c) => c.provider)
    : ranker({ role, issue, candidates });
}

export interface Issue {
  number: number;
  title: string;
  body?: string | null;
  labels: (string | { name: string })[];
  pull_request?: unknown;
  /** Local issues only. */
  blockedBy?: number[];
  closed?: boolean;
  /** Local issues only: path under .sandcastle/specs. */
  file?: string;
}
export interface ReviewReport {
  verdict: "approved" | "changes_requested";
  findings: string[];
  summary: string;
  validation: string;
}
export type Available = (provider: Provider) => boolean;
export interface Assignment {
  issue: Issue;
  provider: Provider;
}

export function labels(issue: Issue): string[] {
  return issue.labels.map((label) =>
    typeof label === "string" ? label : label.name,
  );
}
export function ready(issue: Issue, config: Defaults): boolean {
  return !labels(issue).some((label) =>
    config.blockedLabels.includes(label.toLowerCase()),
  );
}
export function assignments(
  issues: Issue[],
  available: Available,
  config: Defaults,
  quotas?: Quotas,
  ranker?: Ranker,
): Assignment[] {
  const candidates = issues.filter((issue) => ready(issue, config));
  const usable =
    quotas && candidates.length
      ? ranked(candidates[0], "implementation", config, quotas, ranker)
      : config.providers.filter((provider) => available(provider));
  if (!candidates.length || !usable.length) return [];
  const result = [{ issue: candidates[0], provider: usable[0] }];
  if (
    usable.length === 2 &&
    labels(candidates[0]).includes(config.parallelLabel)
  ) {
    const next = candidates
      .slice(1)
      .find((issue) => labels(issue).includes(config.parallelLabel));
    if (next) result.push({ issue: next, provider: usable[1] });
  }
  return result;
}
export function reviewer(
  implementer: Provider,
  available: Available,
): Provider | undefined {
  const opposite = implementer === "codex" ? "claude" : "codex";
  return available(opposite)
    ? opposite
    : available(implementer)
      ? implementer
      : undefined;
}
export function reviewReport(text: string): ReviewReport {
  const matches = [
    ...text.matchAll(/<sandcastle-review>([\s\S]*?)<\/sandcastle-review>/g),
  ];
  if (matches.length !== 1)
    throw new Error("Review must contain exactly one structured verdict");
  const value = JSON.parse(matches[0][1]);
  if (
    !["approved", "changes_requested"].includes(value.verdict) ||
    !Array.isArray(value.findings) ||
    !value.findings.every((entry: unknown) => typeof entry === "string") ||
    typeof value.summary !== "string" ||
    typeof value.validation !== "string" ||
    (value.verdict === "approved" && value.findings.length) ||
    (value.verdict === "changes_requested" && !value.findings.length)
  )
    throw new Error("Invalid review verdict");
  return value;
}

// .sandcastle/specs/<spec-number>-<slug>/issues/<number>-<slug>.md (next to that spec's spec.md), with optional "key: value" frontmatter
// (title, labels: [a, b], blocked_by: [1, 2], status: closed). Issue numbers are unique across specs.
export function localIssue(file: string, text: string): Issue {
  const number = Number(/^\d+-[^/]+\/issues\/(\d+)[^/]*\.md$/.exec(file)?.[1]);
  if (!number)
    throw new Error(
      `.sandcastle/specs/${file}: path must be <spec-number>-<slug>/issues/<issue-number>-<slug>.md, e.g. 1-auth/issues/3-fix-login.md`,
    );
  const name = file.slice(file.lastIndexOf("/") + 1);
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  const fields: Record<string, string> = {};
  for (const line of match?.[1].split(/\r?\n/) ?? []) {
    const pair = /^(\w+):\s*(.*)$/.exec(line.trim());
    if (pair) fields[pair[1]] = pair[2];
  }
  const list = (value = "") =>
    value
      .replace(/^\[|\]$/g, "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  const blockedBy = list(fields.blocked_by).map(Number);
  if (blockedBy.some((value) => !Number.isInteger(value)))
    throw new Error(
      `.sandcastle/specs/${file}: blocked_by must list issue numbers`,
    );
  return {
    number,
    title:
      fields.title ||
      name.replace(/^\d+-?|\.md$/g, "").replace(/-/g, " ") ||
      `Issue ${number}`,
    body: match ? text.slice(match[0].length) : text,
    labels: list(fields.labels),
    blockedBy,
    closed: fields.status?.toLowerCase() === "closed",
    file,
  };
}
