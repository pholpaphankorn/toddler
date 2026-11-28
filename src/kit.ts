import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Config } from "./config.ts";

export const start = "<!-- toddler:start -->";
export const end = "<!-- toddler:end -->";
const block = `${start}
## Specs and issues for toddler

toddler builds this repo's issues. When you write a spec or break one into issues (by hand, or with the to-spec / to-tickets skills), use \`.sandcastle/templates/spec.md\` and \`.sandcastle/templates/issue.md\` for the shape, where each one goes, and the labels toddler needs. These override the skills' own tracker steps. If an issue isn't written that way, toddler never picks it up.

(Written by \`toddler setup\`; anything between these markers is replaced on the next run.)
${end}`;

const count = (text: string, marker: string) => text.split(marker).length - 1;

/** Puts the toddler block into an agent file's text: appended, or replacing only what is between the markers. */
export function spliceBlock(file: string, text: string): string {
  const starts = count(text, start);
  const ends = count(text, end);
  if (!starts && !ends)
    return text ? `${text.replace(/\n*$/, "\n")}\n${block}\n` : `${block}\n`;
  const from = text.indexOf(start);
  const to = text.indexOf(end);
  if (starts !== 1 || ends !== 1 || to < from)
    throw new Error(
      `${file}: needs exactly one ${start} followed by one ${end}; fix the markers and rerun toddler setup`,
    );
  return text.slice(0, from) + block + text.slice(to + end.length);
}

const body = `## Problem Statement

<The problem the user faces, from their perspective.>

## Solution

<The solution, from the user's perspective.>

## User Stories

1. As a <actor>, I want <feature>, so that <benefit>

## Implementation Decisions

- <Modules built or changed, their interfaces, contracts, architectural choices. No file paths or code snippets, except a prototype snippet that states a decision better than prose.>

## Testing Decisions

- <What a good test checks (external behaviour only), which modules are tested, prior art in the repo.>

## Out of Scope

- <What this spec does not cover.>

## Further Notes

<Anything else.>
`;
const work = `## What to build

<The end-to-end behaviour this issue makes work, from the user's perspective: one thin vertical slice, demoable on its own, sized for one fresh agent session. Not a layer-by-layer list; no file paths or code snippets.>

## Acceptance criteria

- [ ] <Criterion the reviewer can verify>
- [ ] <Criterion>
`;

/** The configured tracker's spec and issue templates, with the configured label names written in. */
export function templates(config: Config): { spec: string; issue: string } {
  const code = (label: string) => `\`${label}\``;
  const hold = config.blockedLabels.length
    ? ` ${config.blockedLabels.map(code).join(" or ")} holds it back.`
    : "";
  const labels = `Add ${code(config.parallelLabel)} if it can run beside other issues.${hold} Add ${code(config.adultLabel)} when a person, not toddler, should do it: toddler never picks it.`;
  const picked = `Use the ${code(config.issueLabel)} label where to-tickets says ready-for-agent: only ${code(config.issueLabel)} issues are picked up. ${labels}`;
  const plain = `Publish as a plain issue WITHOUT the ${code(config.issueLabel)} label (toddler would try to build it), and no ready-for-agent label:`;
  if (config.issues === "files")
    return {
      spec: `<!-- toddler spec template (files tracker), shaped like the to-spec skill. Delete this comment.
Save as .sandcastle/specs/<n>-<slug>/spec.md (<n> = next free spec number). The spec is never built; its issues are, as files in issues/ beside it. -->
# <Spec title>

${body}`,
      issue: `---
title: <Issue title>
labels: []
blocked_by: []
parent: <spec n>
status: open
---
<!-- toddler issue template (files tracker), shaped like the to-tickets issue template. Delete this comment.
- Save as .sandcastle/specs/<spec n>-<slug>/issues/<n>-<slug>.md. <n> is unique across ALL specs: highest issue number under .sandcastle/specs/ plus one. Write blockers first.
- Blockers go in \`blocked_by\` (issue numbers), not a "Blocked by" section. toddler sets \`status: closed\` when the work lands.
- Every open file here is picked up (no ${code(config.issueLabel)} or ready-for-agent label needed). In \`labels\`: ${labels} -->
## Parent

[<Spec title>](../spec.md)

${work}`,
    };
  if (config.forge === "gitlab")
    return {
      spec: `<!-- toddler spec template (GitLab), shaped like the to-spec skill. Delete this comment.
${plain}
  glab issue create --repo <group/project> --title "<Spec title>" --description "$(cat <this file>)"
Its issues point back with a \`Spec:\` line (see issue.md). -->
${body}`,
      issue: `<!-- toddler issue template (GitLab), shaped like the to-tickets issue template. Delete this comment.
${picked}
Publish blockers first: glab issue create --repo <group/project> --title "<Issue title>" --label ${config.issueLabel} --description "$(cat <this file>)"
toddler reads the \`Spec:\` and \`Blocked by:\` lines as written: exactly one \`Spec:\` line; \`Blocked by:\` lists iids comma-separated, and the whole section goes when there are none. -->
## Parent

Spec: #<spec iid>

${work}
## Blocked by

Blocked by: #<iid>, #<iid>
`,
    };
  return {
    spec: `<!-- toddler spec template (GitHub), shaped like the to-spec skill. Delete this comment.
${plain}
  gh issue create --repo <owner/repo> --title "<Spec title>" --body-file <this file>
Its issues become sub-issues of it (see issue.md). -->
${body}`,
    issue: `<!-- toddler issue template (GitHub), shaped like the to-tickets issue template. Delete this comment.
${picked}
Publish blockers first, then for each issue:
  n=$(gh issue create --repo <owner/repo> --title "<Issue title>" --label ${config.issueLabel} --body-file <this file> | grep -o '[0-9]*$')
  gh api -X POST repos/<owner/repo>/issues/<spec n>/sub_issues -F sub_issue_id=$(gh api repos/<owner/repo>/issues/$n --jq .id)
  gh api -X POST repos/<owner/repo>/issues/$n/dependencies/blocked_by -F issue_id=$(gh api repos/<owner/repo>/issues/<blocker n> --jq .id)
Blockers are native edges, so there is no "Blocked by" section. -->
## Parent

#<spec n>

${work}`,
  };
}

/** Every kit file's wanted content, given how to read the current one (null: missing). */
function kitFiles(config: Config, read: (path: string) => string | null) {
  const { spec, issue } = templates(config);
  const files = new Map([
    [".sandcastle/templates/spec.md", spec],
    [".sandcastle/templates/issue.md", issue],
  ]);
  const agents = read("AGENTS.md");
  const claude = read("CLAUDE.md");
  if (agents === null && claude === null) {
    files.set("AGENTS.md", spliceBlock("AGENTS.md", ""));
    files.set("CLAUDE.md", "@AGENTS.md\n");
    return files;
  }
  if (agents !== null) files.set("AGENTS.md", spliceBlock("AGENTS.md", agents));
  // A CLAUDE.md importing AGENTS.md gets the block from there; it stays a kit file, unchanged.
  if (claude !== null)
    files.set(
      "CLAUDE.md",
      agents !== null &&
        /^@AGENTS\.md$/m.test(claude) &&
        !claude.includes(start)
        ? claude
        : spliceBlock("CLAUDE.md", claude),
    );
  return files;
}

const message = "toddler: set up planning kit";

/** Writes the planning kit files that differ and commits the kit paths git reports changed. Returns the output lines. */
export function writeKit(root: string, config: Config): string[] {
  const git = (...args: string[]) =>
    execFileSync("git", args, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  const working = (path: string) =>
    existsSync(join(root, path))
      ? readFileSync(join(root, path), "utf8")
      : null;
  const wanted = kitFiles(config, working); // throws on bad markers, before anything is written
  const changed = () =>
    git(
      "status",
      "--porcelain",
      "--untracked-files=all",
      "--",
      ...wanted.keys(),
    )
      .split("\n")
      .filter(Boolean)
      .map((line) => line.slice(3));
  let fromHead: Map<string, string> | undefined;
  try {
    fromHead = kitFiles(config, (path) => {
      try {
        return git("show", `HEAD:${path}`);
      } catch {
        return null;
      }
    });
  } catch {
    /* HEAD's markers are bad, so every changed kit file is the user's. */
  }
  // A changed kit file is ours (an interrupted run) only if it is exactly what setup writes over HEAD.
  const theirs = changed().filter(
    (path) => working(path) !== fromHead?.get(path),
  );
  const lines: string[] = [];
  for (const [path, text] of wanted) {
    if (working(path) === text) continue;
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
    lines.push(`kit: wrote ${path}`);
  }
  for (const path of theirs)
    lines.push(`${path}: has your uncommitted edits, commit it yourself`);
  const commit = changed().filter((path) => !theirs.includes(path));
  if (!commit.length) {
    if (!lines.length) lines.push("kit: up to date");
    return lines;
  }
  try {
    git("symbolic-ref", "-q", "HEAD");
  } catch {
    lines.push("detached HEAD: kit written, not committed");
    return lines;
  }
  git("add", "--", ...commit);
  git("commit", "--only", "-m", message, "--", ...commit);
  lines.push(
    `kit: committed ${git("rev-parse", "--short", "HEAD").trim()} (${message})`,
  );
  return lines;
}
