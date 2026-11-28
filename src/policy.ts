import { type Defaults, type Provider } from "./config.ts";
import type { Reading } from "./quota.ts";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export type Ranker = (input: {
  candidates: {
    provider: Provider;
    model: string;
    reading: Reading;
    running: number;
  }[];
}) => Provider[];

export const builtinRankers = ["balanced", "most-quota"];

export class RankingError extends Error {}

export async function loadRanker(
  root: string,
  config: Defaults,
): Promise<Ranker> {
  const name = config.ranking;
  let ranker: Ranker;
  try {
    const url = builtinRankers.includes(name)
      ? new URL(`./rankers/${name}.ts`, import.meta.url)
      : pathToFileURL(resolve(root, name));
    const module = await import(url.href);
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
  return !labels(issue).some(
    (label) =>
      config.blockedLabels.includes(label.toLowerCase()) ||
      label.toLowerCase() === config.adultLabel.toLowerCase(),
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
