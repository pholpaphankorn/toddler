import { readFile, readdir, mkdtemp, writeFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Issue } from "./policy.ts";
import { command, type Command } from "./process.ts";
import { type Config } from "./config.ts";

export async function validatePushRemote(
  run: Command,
  remote: string,
  repository: string,
  forge: string,
): Promise<void> {
  const destinations = await run("git", [
    "remote",
    "get-url",
    "--push",
    "--all",
    remote,
  ]);
  for (const destination of destinations.split("\n")) {
    let path: string;
    try {
      path = new URL(destination).pathname.replace(/^\//, "");
    } catch {
      path = destination.match(/^[^/]+:(.+)$/)?.[1] ?? "";
    }
    if (path.replace(/\.git\/?$/, "").replace(/\/$/, "") !== repository)
      throw new Error(
        `Configured push remote does not match the ${forge === "gitlab" ? "GitLab" : "GitHub"} repository`,
      );
  }
}
export interface Tracker {
  issues(): Promise<Issue[]>;
  blocked(issue: Issue, done?: (number: number) => boolean): Promise<boolean>;
  comments(issue: Issue): Promise<string[]>;
  spec(id: number): Promise<unknown>;
  requestReference(issue: Issue): { ref: string; closes: string };
}
export interface Forge {
  tracker?: Tracker;
  enabled: boolean;
  remote: boolean;
  base(branch?: string): Promise<{ branch: string; ref: string }>;
  findRequest(
    branch: string,
  ): Promise<{ url: string; open: boolean } | undefined>;
  openRequest(input: {
    branch: string;
    sha: string;
    base: string;
    title: string;
    body: string;
  }): Promise<string>;
  doctorChecks(config: Config): [string, () => Promise<string>][];
  enableAutoMerge(url: string): Promise<void>;
}
export class FilesTracker implements Tracker {
  private open = new Map<number, ReturnType<typeof localIssue>>();
  private root: string;
  constructor(root: string) {
    this.root = root;
  }
  async issues(): Promise<Issue[]> {
    const prefix = ".sandcastle/specs/";
    let files = existsSync(join(this.root, prefix))
      ? await readdir(join(this.root, prefix), { recursive: true })
      : [];
    files = files.filter((file) => /^[^/]+\/issues\/[^/]+\.md$/.test(file));
    const parsed = await Promise.all(
      files.map(async (file) =>
        localIssue(file, await readFile(join(this.root, prefix, file), "utf8")),
      ),
    );
    const seen = new Set<number>();
    for (const issue of parsed) {
      if (seen.has(issue.number))
        throw new Error(
          `.sandcastle/specs: more than one file for issue ${issue.number}`,
        );
      seen.add(issue.number);
    }
    this.open = new Map(
      parsed
        .filter((issue) => !issue.closed)
        .map((issue) => [issue.number, issue]),
    );
    return [...this.open.values()]
      .sort((a, b) => a.number - b.number)
      .map(({ number, title, body, labels }) => ({
        number,
        title,
        body,
        labels,
      }));
  }
  async blocked(
    issue: Issue,
    done: (number: number) => boolean = () => false,
  ): Promise<boolean> {
    return (
      this.open
        .get(issue.number)
        ?.blockedBy.some((number) => this.open.has(number) && !done(number)) ??
      false
    );
  }
  async comments(_issue: Issue): Promise<string[]> {
    return [];
  }
  async spec(_id: number): Promise<unknown> {
    throw new Error("Spec is not implemented");
  }
  requestReference(issue: Issue) {
    return { ref: `local issue ${issue.number}`, closes: "" };
  }
}
export class GitHubForge implements Forge {
  enabled: boolean;
  remote = true;
  tracker: Tracker;
  private gh(args: string[]) {
    return this.ghCommand("gh", args, { cwd: this.root });
  }
  private git(args: string[]) {
    return this.gitCommand("git", args, { cwd: this.root });
  }
  private root: string;
  private config: Config;
  private gitCommand: Command;
  private ghCommand: Command;
  constructor(
    root: string,
    config: Config,
    gitCommand: Command = command,
    ghCommand: Command = command,
  ) {
    this.root = root;
    this.config = config;
    this.gitCommand = gitCommand;
    this.ghCommand = ghCommand;
    this.enabled = true;
    const gh = (args: string[]) => this.gh(args);
    this.tracker = {
      issues: async () => {
        const items: {
          number: number;
          title: string;
          body: string | null;
          labels: { name: string }[];
          pull_request?: unknown;
        }[] = JSON.parse(
          await gh([
            "api",
            "--paginate",
            "--slurp",
            `repos/${config.repository}/issues?state=open&labels=${encodeURIComponent(config.issueLabel)}&per_page=100`,
          ]),
        ).flat();
        return items
          .filter((item) => !item.pull_request)
          .sort((a, b) => a.number - b.number)
          .map(({ number, title, body, labels }) => ({
            number,
            title,
            body,
            labels: labels.map((label) => label.name),
          }));
      },
      blocked: async (issue) =>
        (
          JSON.parse(
            await gh([
              "api",
              "--paginate",
              "--slurp",
              `repos/${config.repository}/issues/${issue.number}/dependencies/blocked_by?per_page=100`,
            ]),
          ).flat() as { state: string }[]
        ).some((item) => item.state === "open"),
      comments: async (issue) =>
        (
          JSON.parse(
            await gh([
              "api",
              "--paginate",
              "--slurp",
              `repos/${config.repository}/issues/${issue.number}/comments?per_page=100`,
            ]),
          ).flat() as { body: string }[]
        ).map((item) => item.body),
      requestReference: (issue) => ({
        ref: `#${issue.number}`,
        closes: `Closes #${issue.number}\n\n`,
      }),
      spec: async (_id) => {
        throw new Error("Spec is not implemented");
      },
    };
  }
  async base(branch?: string) {
    branch ??= JSON.parse(
      await this.gh([
        "repo",
        "view",
        this.config.repository,
        "--json",
        "defaultBranchRef",
      ]),
    ).defaultBranchRef.name;
    await this.git(["fetch", this.config.remote, branch!]);
    return { branch: branch!, ref: `${this.config.remote}/${branch}` };
  }
  async findRequest(branch: string) {
    const requests: { url: string; state: string }[] = JSON.parse(
      await this.gh([
        "pr",
        "list",
        "--repo",
        this.config.repository,
        "--head",
        branch,
        "--state",
        "all",
        "--json",
        "url,state",
      ]),
    );
    const request = requests.find((item) => item.state !== "CLOSED");
    return request && { url: request.url, open: request.state === "OPEN" };
  }
  async openRequest(input: {
    branch: string;
    sha: string;
    base: string;
    title: string;
    body: string;
  }) {
    await this.git([
      "push",
      this.config.remote,
      `${input.sha}:refs/heads/${input.branch}`,
    ]);
    const directory = await mkdtemp(join(tmpdir(), "sandcastle-pr-"));
    try {
      const file = join(directory, "body.md");
      await writeFile(file, input.body, { mode: 0o600 });
      return await this.gh([
        "pr",
        "create",
        "--repo",
        this.config.repository,
        "--base",
        input.base,
        "--head",
        input.branch,
        "--title",
        input.title,
        "--body-file",
        file,
      ]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
  doctorChecks(config: Config): [string, () => Promise<string>][] {
    return [
      [
        "GitHub",
        async () => {
          const repo = JSON.parse(
            await this.gh([
              "repo",
              "view",
              this.config.repository,
              "--json",
              "nameWithOwner,viewerPermission,defaultBranchRef",
            ]),
          );
          if (!["ADMIN", "MAINTAIN", "WRITE"].includes(repo.viewerPermission))
            throw new Error(
              "Repository write permission needed to push issue branches",
            );
          if (
            config.autoMerge &&
            !JSON.parse(await this.gh(["api", `repos/${config.repository}`]))
              .allow_auto_merge
          )
            throw new Error("Repository does not allow auto-merge");
          return `${repo.nameWithOwner}, base ${repo.defaultBranchRef.name}, ${repo.viewerPermission}`;
        },
      ],
      ...(config.issues === "forge"
        ? [
            [
              "Issue label",
              async () => {
                await this.gh([
                  "api",
                  `repos/${config.repository}/labels/${encodeURIComponent(config.issueLabel)}`,
                ]);
                return config.issueLabel;
              },
            ] as [string, () => Promise<string>],
          ]
        : []),
    ];
  }
  async enableAutoMerge(url: string) {
    const repo = JSON.parse(
      await this.gh(["api", `repos/${this.config.repository}`]),
    );
    const { viewerDefaultMergeMethod } = JSON.parse(
      await this.gh([
        "repo",
        "view",
        this.config.repository,
        "--json",
        "viewerDefaultMergeMethod",
      ]),
    );
    const preferred = {
      MERGE: repo.allow_merge_commit && "--merge",
      SQUASH: repo.allow_squash_merge && "--squash",
      REBASE: repo.allow_rebase_merge && "--rebase",
    }[viewerDefaultMergeMethod as "MERGE" | "SQUASH" | "REBASE"];
    const method =
      preferred ||
      (repo.allow_merge_commit
        ? "--merge"
        : repo.allow_squash_merge
          ? "--squash"
          : repo.allow_rebase_merge
            ? "--rebase"
            : undefined);
    if (!method) throw new Error("Repository has no enabled merge method");
    await this.gh(["pr", "merge", url, "--auto", method]).catch(
      (error: Error) => {
        // GitHub refuses auto-merge when nothing is pending: merge now.
        if (!/clean status/i.test(error.message)) throw error;
        return this.gh(["pr", "merge", url, method]);
      },
    );
  }
}
export class GitLabForge implements Forge {
  enabled = true;
  remote = true;
  tracker: Tracker;
  private project: string;
  private root: string;
  private config: Config;
  private gitCommand: Command;
  private glabCommand: Command;
  constructor(
    root: string,
    config: Config,
    gitCommand: Command = command,
    glabCommand: Command = command,
  ) {
    this.root = root;
    this.config = config;
    this.gitCommand = gitCommand;
    this.glabCommand = glabCommand;
    this.project = `projects/${encodeURIComponent(config.repository)}`;
    this.tracker = {
      issues: async () =>
        (
          await this.list(
            `${this.project}/issues?state=opened&labels=${encodeURIComponent(config.issueLabel)}&per_page=100`,
          )
        )
          .filter((item: any) => item.labels.includes(config.issueLabel))
          .map((item: any) => ({
            number: item.iid,
            title: item.title,
            body: item.description,
            labels: item.labels,
          }))
          .sort((a: Issue, b: Issue) => a.number - b.number),
      blocked: async (issue) => {
        const links = await this.list(
          `${this.project}/issues/${issue.number}/links?per_page=100`,
        );
        if (
          links.some(
            (item: any) =>
              item.link_type === "is_blocked_by" && item.state === "opened",
          )
        )
          return true;
        for (const line of (issue.body ?? "").split(/\r?\n/)) {
          const match = /^Blocked by:\s*(.*)$/i.exec(line);
          if (!match) continue;
          if (!/^#\d+(?:\s*,\s*#\d+)*\s*$/.test(match[1])) {
            console.error(
              `[issue #${issue.number}] unresolvable blocker: ${line}`,
            );
            return true;
          }
          for (const ref of match[1].matchAll(/#(\d+)/g)) {
            let blocker;
            try {
              blocker = await this.api(`${this.project}/issues/${ref[1]}`);
            } catch (error) {
              console.error(
                `[issue #${issue.number}] unresolvable blocker: ${line} (${(error as Error).message})`,
              );
              return true;
            }
            if (blocker.state === "opened") return true;
          }
        }
        return false;
      },
      comments: async (issue) =>
        (
          await this.list(
            `${this.project}/issues/${issue.number}/notes?per_page=100`,
          )
        ).map((item: any) => item.body),
      requestReference: (issue) => ({
        ref: `#${issue.number}`,
        closes: `Closes #${issue.number}\n\n`,
      }),
      spec: async () => {
        throw new Error("Spec is not implemented");
      },
    };
  }
  private async api(path: string, args: string[] = []) {
    return JSON.parse(
      await this.glabCommand("glab", ["api", path, ...args], {
        cwd: this.root,
      }),
    );
  }
  private async list(path: string): Promise<any[]> {
    const output = await this.glabCommand(
      "glab",
      ["api", path, "--paginate", "--output", "ndjson"],
      { cwd: this.root },
    );
    return output
      .split("\n")
      .filter(Boolean)
      .flatMap((line) => JSON.parse(line));
  }
  async base(branch?: string) {
    branch ??= (await this.api(this.project)).default_branch;
    await this.gitCommand("git", ["fetch", this.config.remote, branch!], {
      cwd: this.root,
    });
    return { branch: branch!, ref: `${this.config.remote}/${branch}` };
  }
  async findRequest(branch: string) {
    const requests = await this.list(
      `${this.project}/merge_requests?source_branch=${encodeURIComponent(branch)}&per_page=100`,
    );
    const request = requests.find(
      (item) => item.state === "opened" || item.state === "merged",
    );
    return (
      request && { url: request.web_url, open: request.state === "opened" }
    );
  }
  async openRequest(input: {
    branch: string;
    sha: string;
    base: string;
    title: string;
    body: string;
  }) {
    await this.gitCommand(
      "git",
      ["push", this.config.remote, `${input.sha}:refs/heads/${input.branch}`],
      { cwd: this.root },
    );
    const result = await this.api(`${this.project}/merge_requests`, [
      "--method",
      "POST",
      "--raw-field",
      `source_branch=${input.branch}`,
      "--raw-field",
      `target_branch=${input.base}`,
      "--raw-field",
      `title=${input.title}`,
      "--raw-field",
      `description=${input.body}`,
    ]);
    return result.web_url as string;
  }
  doctorChecks(config: Config): [string, () => Promise<string>][] {
    return [
      [
        "GitLab",
        async () => {
          const project = await this.api(this.project);
          if (
            Math.max(
              project.permissions?.project_access?.access_level ?? 0,
              project.permissions?.group_access?.access_level ?? 0,
            ) < 30
          )
            throw new Error("Developer access needed to push issue branches");
          return `${project.path_with_namespace}, base ${project.default_branch}`;
        },
      ],
      ...(config.issues === "forge"
        ? [
            [
              "Issue label",
              async () => {
                await this.api(
                  `${this.project}/labels/${encodeURIComponent(config.issueLabel)}`,
                );
                return config.issueLabel;
              },
            ] as [string, () => Promise<string>],
          ]
        : []),
    ];
  }
  async enableAutoMerge(url: string) {
    const iid = /\/merge_requests\/(\d+)/.exec(url)?.[1];
    if (!iid) throw new Error("Invalid GitLab merge request URL");
    await this.api(`${this.project}/merge_requests/${iid}/merge`, [
      "--method",
      "PUT",
      "--field",
      "auto_merge=true",
    ]);
  }
}
export class NoneForge implements Forge {
  enabled = false;
  remote = false;
  private root: string;
  private gitCommand: Command;
  constructor(root: string, gitCommand: Command = command) {
    this.root = root;
    this.gitCommand = gitCommand;
  }
  async base(branch?: string) {
    branch ??= await this.gitCommand("git", ["branch", "--show-current"], {
      cwd: this.root,
    });
    if (!branch)
      throw new Error("Check out a branch for local issues to start from");
    return { branch, ref: branch };
  }
  async findRequest(_branch: string) {
    return undefined;
  }
  async openRequest(): Promise<string> {
    throw new Error("No forge configured");
  }
  doctorChecks(config: Config): [string, () => Promise<string>][] {
    return [
      [
        "Forge",
        async () =>
          `none (nothing pushed; autoMerge ${config.autoMerge ? "on" : "off"})`,
      ],
    ];
  }
  async enableAutoMerge(_url: string) {}
}
export function connect(
  root: string,
  config: Config,
  git: Command = command,
  gh: Command = command,
) {
  const forge: Forge =
    config.forge === "none"
      ? new NoneForge(root, git)
      : config.forge === "gitlab"
        ? new GitLabForge(root, config, git, gh)
        : new GitHubForge(root, config, git, gh);
  const tracker =
    config.issues === "files" ? new FilesTracker(root) : forge.tracker!;
  return { forge, tracker };
}

// .sandcastle/specs/<spec-number>-<slug>/issues/<number>-<slug>.md (next to that spec's spec.md), with optional "key: value" frontmatter
// (title, labels: [a, b], blocked_by: [1, 2], status: closed). Issue numbers are unique across specs.
function localIssue(
  file: string,
  text: string,
): Issue & { blockedBy: number[]; closed: boolean; file: string } {
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
