export function labels(issue) { return issue.labels.map((label) => typeof label === "string" ? label : label.name); }
export function ready(issue, config) {
  return !labels(issue).some((label) => config.blockedLabels.includes(label.toLowerCase()));
}
export function assignments(issues, available, config) {
  const candidates = issues.filter((issue) => ready(issue, config));
  const providers = ["codex", "claude"].filter((provider) => available(provider));
  if (!candidates.length || !providers.length) return [];
  const result = [{ issue: candidates[0], provider: providers[0] }];
  if (providers.length === 2 && labels(candidates[0]).includes(config.parallelLabel)) {
    const next = candidates.slice(1).find((issue) => labels(issue).includes(config.parallelLabel));
    if (next) result.push({ issue: next, provider: providers[1] });
  }
  return result;
}
export function reviewer(implementer, available) {
  const opposite = implementer === "codex" ? "claude" : "codex";
  return available(opposite) ? opposite : available(implementer) ? implementer : undefined;
}
export function reviewReport(text) {
  const matches = [...text.matchAll(/<sandcastle-review>([\s\S]*?)<\/sandcastle-review>/g)];
  if (matches.length !== 1) throw new Error("Review must contain exactly one structured verdict");
  const value = JSON.parse(matches[0][1]);
  if (!["approved", "changes_requested"].includes(value.verdict) ||
      !Array.isArray(value.findings) || !value.findings.every((entry) => typeof entry === "string") ||
      typeof value.summary !== "string" || typeof value.validation !== "string" ||
      (value.verdict === "approved" && value.findings.length) ||
      (value.verdict === "changes_requested" && !value.findings.length)) throw new Error("Invalid review verdict");
  return value;
}
