import { type Defaults, type Provider, type Role } from "./config.ts";
import { weeklyLeft, type Reading } from "./quota.ts";
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

export interface Issue {
  number: number;
  title: string;
  body?: string | null;
  labels: string[];
}
export interface ReviewReport {
  verdict: "approved" | "changes_requested";
  findings: string[];
  summary: string;
  validation: string;
}

export function labels(issue: Issue): string[] {
  return issue.labels;
}
export function ready(issue: Issue, config: Defaults): boolean {
  return !labels(issue).some((label) =>
    config.blockedLabels.includes(label.toLowerCase()),
  );
}
export function reviewReport(text: string): ReviewReport {
  const matches = [
    // body must start with "{" (after whitespace) so a prose mention of the tag is not taken as the verdict
    ...text.matchAll(
      /<sandcastle-review>\s*(\{[\s\S]*?)<\/sandcastle-review>/g,
    ),
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
