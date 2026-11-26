import {
  readFile,
  readdir,
  mkdtemp,
  writeFile,
  rm,
  lstat,
} from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Issue } from "./policy.ts";
import { command, type Command } from "./process.ts";
import { type Config } from "./config.ts";
import { logTails } from "./logtail.ts";

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
export interface Spec {
  id: number;
  title: string;
  body: string;
  issues: { number: number; title: string; state: "open" | "closed" }[];
}
export interface Tracker {
  issues(): Promise<Issue[]>;
  blocked(issue: Issue, done?: (number: number) => boolean): Promise<boolean>;
  comments(issue: Issue): Promise<string[]>;
  spec(id: number): Promise<Spec>;
  requestReference(issue: Issue): { ref: string; closes: string };
}
export interface Delivery {
  branch: string;
  sha: string;
  base: string;
  title: string;
  body: string;
}
export type Delivered =
  | { state: "landed" | "moved" }
  | { state: "waiting"; url: string }
  | { state: "refused"; reason: string };
export type Polled =
  | {
      state:
        | "none"
        | "landed"
        | "closed"
        | "review-required"
        | "conflict"
        | "behind"
        | "auto-merge-off"
        | "waiting";
    }
  | { state: "refused"; reason: string }
  | {
      state: "ci-failed";
      checks: { name: string; link: string; tail?: string }[];
    };
export interface Forge {
  tracker?: Tracker;
  base(branch?: string): Promise<{ branch: string; ref: string }>;
  // Hands over one finished SHA; only NoneForge returns landed or moved.
  deliver(job: Delivery): Promise<Delivered>;
  // `base` is the base branch name; only NoneForge needs it.
  poll(job: { branch: string; sha: string; base: string }): Promise<Polled>;
  doctorChecks(config: Config): [string, () => Promise<string>][];
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
  async spec(id: number): Promise<Spec> {
    const prefix = join(this.root, ".sandcastle/specs");
    const folders = (await readdir(prefix)).filter((name) =>
      name.startsWith(`${id}-`),
    );
    if (folders.length !== 1)
      throw new Error(`Expected one folder for spec ${id}`);
    const folder = folders[0];
    const body = await readFile(join(prefix, folder, "spec.md"), "utf8");
    const dir = join(prefix, folder, "issues");
    const files = existsSync(dir) ? await readdir(dir) : [];
    const issues = await Promise.all(
      files
        .filter((file) => file.endsWith(".md"))
        .map(async (file) => {
          const issue = localIssue(
            `${folder}/issues/${file}`,
            await readFile(join(dir, file), "utf8"),
          );
          return {
            number: issue.number,
            title: issue.title,
            state: issue.closed ? ("closed" as const) : ("open" as const),
          };
        }),
    );
    return {
      id,
      title:
        /^#\s+(.+)\s*$/m.exec(body)?.[1].trim() ??
        folder.slice(String(id).length + 1).replace(/-/g, " "),
      body,
      issues,
    };
  }
  requestReference(issue: Issue) {
    return { ref: `local issue ${issue.number}`, closes: "" };
  }
}
// Shared by GitHub and GitLab: push the exact SHA, reuse or open the request, (re)enable auto-merge.
async function deliverRequest(
  forge: {
    findRequest(
      branch: string,
    ): Promise<{ url: string; open: boolean } | undefined>;
    openRequest(input: Delivery): Promise<string>;
    enableAutoMerge(url: string, sha: string): Promise<void>;
  },
  push: () => Promise<unknown>,
  autoMerge: boolean,
  input: Delivery,
): Promise<Delivered> {
  // Plain push, no lease or force: a rejection (someone else pushed, protected branch) is never worked around.
  try {
    await push();
  } catch (error) {
    return {
      state: "refused",
      reason: `Push of ${input.sha} to ${input.branch} was rejected: ${(error as Error).message}`,
    };
  }
  const existing = await forge.findRequest(input.branch);
  const url = existing?.open ? existing.url : await forge.openRequest(input);
  if (autoMerge) {
    try {
      await forge.enableAutoMerge(url, input.sha);
    } catch (error) {
      return {
        state: "refused",
        reason: `Could not enable auto-merge on ${url}: ${(error as Error).message}`,
      };
    }
  }
  return { state: "waiting", url };
}
// shortcut: GitLab reads only whether a request exists and merged; #89 maps mergeability, CI and auto-merge.
async function pollRequest(
  request: Promise<{ url: string; open: boolean } | undefined>,
): Promise<Polled> {
  const found = await request;
  return { state: !found ? "none" : found.open ? "waiting" : "landed" };
}
interface GitHubRequest {
  url: string;
  state: "OPEN" | "MERGED" | "CLOSED";
  headRefOid?: string;
  mergeable?: "MERGEABLE" | "CONFLICTING" | "UNKNOWN" | null;
  mergeStateStatus?: string | null;
  reviewDecision?: string | null;
  autoMergeRequest?: object | null;
  statusCheckRollup?: {
    __typename?: string;
    name?: string;
    context?: string;
    status?: string;
    conclusion?: string | null;
    state?: string;
    detailsUrl?: string;
    targetUrl?: string;
  }[];
}
export class GitHubForge implements Forge {
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
      spec: async (id) => {
        const [owner, name] = config.repository.split("/");
        const result = JSON.parse(
          await gh([
            "api",
            "graphql",
            "-f",
            `query=query($owner: String!, $name: String!, $number: Int!) { repository(owner: $owner, name: $name) { issue(number: $number) { number title body subIssues(first: 100) { nodes { number title state } } } } }`,
            "-f",
            `owner=${owner}`,
            "-f",
            `name=${name}`,
            "-F",
            `number=${id}`,
          ]),
        );
        if (result.errors?.length)
          throw new Error(JSON.stringify(result.errors));
        const issue = result.data?.repository?.issue;
        if (!issue) throw new Error(`Spec ${id} not found`);
        return {
          id: issue.number,
          title: issue.title,
          body: issue.body,
          issues: issue.subIssues.nodes.map(
            (child: { number: number; title: string; state: string }) => ({
              number: child.number,
              title: child.title,
              state: child.state.toLowerCase() as "open" | "closed",
            }),
          ),
        };
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
  deliver(input: Delivery) {
    return deliverRequest(
      this,
      () =>
        this.git([
          "push",
          this.config.remote,
          `${input.sha}:refs/heads/${input.branch}`,
        ]),
      this.config.autoMerge,
      input,
    );
  }
  // One read, mapped in the seam's precedence; failing Actions jobs then get their log tails.
  async poll(job: {
    branch: string;
    sha: string;
    base: string;
  }): Promise<Polled> {
    const requests: GitHubRequest[] = JSON.parse(
      await this.gh([
        "pr",
        "list",
        "--repo",
        this.config.repository,
        "--head",
        job.branch,
        "--state",
        "all",
        "--json",
        "url,state,headRefOid,mergeable,mergeStateStatus,reviewDecision,autoMergeRequest,statusCheckRollup",
      ]),
    );
    const find = (state: GitHubRequest["state"]) =>
      requests.find((item) => item.state === state);
    if (find("MERGED")) return { state: "landed" };
    const pr = find("OPEN");
    if (!pr) return { state: find("CLOSED") ? "closed" : "none" };
    // Someone else pushed to the PR branch: unreviewed, so never wait on or land it.
    if (job.sha && pr.headRefOid !== job.sha)
      return {
        state: "refused",
        reason: `${pr.url} head is ${pr.headRefOid}, not the delivered ${job.sha}`,
      };
    if (["REVIEW_REQUIRED", "CHANGES_REQUESTED"].includes(pr.reviewDecision!))
      return { state: "review-required" };
    // Still being computed: ask again next poll.
    if (!pr.mergeable || pr.mergeable === "UNKNOWN")
      return { state: "waiting" };
    if (pr.mergeable === "CONFLICTING" || pr.mergeStateStatus === "DIRTY")
      return { state: "conflict" };
    if (pr.mergeStateStatus === "BEHIND") return { state: "behind" };
    const checks = pr.statusCheckRollup ?? [];
    const context = (check: (typeof checks)[number]) =>
      check.__typename === "StatusContext" || check.context !== undefined;
    // Only finished CI counts: one check still running means wait for the rest.
    const pending = checks.some((check) =>
      context(check)
        ? ["PENDING", "EXPECTED"].includes(check.state!)
        : check.status !== "COMPLETED",
    );
    const failed = checks.filter((check) =>
      context(check)
        ? ["FAILURE", "ERROR"].includes(check.state!)
        : check.status === "COMPLETED" &&
          !["SUCCESS", "NEUTRAL", "SKIPPED"].includes(check.conclusion!),
    );
    if (failed.length && !pending)
      return {
        state: "ci-failed",
        checks: logTails(
          await Promise.all(
            failed.map(async (check) => {
              const link =
                (context(check) ? check.targetUrl : check.detailsUrl) ?? "";
              // Raw logs exist only for GitHub Actions jobs; other checks stay name + link.
              const job = /\/actions\/runs\/\d+\/job\/(\d+)/.exec(link)?.[1];
              return {
                name: (context(check) ? check.context : check.name) ?? "",
                link,
                log: job
                  ? await this.gh([
                      "run",
                      "view",
                      "--repo",
                      this.config.repository,
                      "--job",
                      job,
                      "--log-failed",
                    ]).catch(() => undefined)
                  : undefined,
              };
            }),
          ),
        ).checks.map(({ name, link, tail }) => ({
          name,
          link: link ?? "",
          ...(tail !== undefined && { tail }),
        })),
      };
    return { state: pr.autoMergeRequest ? "waiting" : "auto-merge-off" };
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
  // Tied to the pushed SHA: a foreign push in between is never merged or armed.
  async enableAutoMerge(url: string, sha: string) {
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
    const head = ["--match-head-commit", sha];
    await this.gh(["pr", "merge", url, "--auto", method, ...head]).catch(
      (error: Error) => {
        // GitHub refuses auto-merge when nothing is pending: merge now.
        if (!/clean status/i.test(error.message)) throw error;
        return this.gh(["pr", "merge", url, method, ...head]);
      },
    );
  }
}
export class GitLabForge implements Forge {
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
      spec: async (id) => {
        const spec = await this.api(`${this.project}/issues/${id}`);
        const items = await this.list(
          `${this.project}/issues?scope=all&per_page=100`,
        );
        const issues: Spec["issues"] = [];
        for (const item of items) {
          const lines = (item.description ?? "")
            .split(/\r?\n/)
            .filter((line: string) => /^Spec:/i.test(line));
          if (
            !lines.some((line: string) =>
              new RegExp(`^Spec:\\s*#${id}\\s*$`, "i").test(line),
            )
          )
            continue;
          if (lines.length > 1)
            throw new Error(`Issue #${item.iid} has duplicate Spec: lines`);
          issues.push({
            number: item.iid,
            title: item.title,
            state: item.state === "opened" ? "open" : "closed",
          });
        }
        return {
          id: spec.iid,
          title: spec.title,
          body: spec.description ?? "",
          issues,
        };
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
  deliver(input: Delivery) {
    return deliverRequest(
      this,
      () =>
        this.gitCommand(
          "git",
          [
            "push",
            this.config.remote,
            `${input.sha}:refs/heads/${input.branch}`,
          ],
          { cwd: this.root },
        ),
      this.config.autoMerge,
      input,
    );
  }
  poll(job: { branch: string }) {
    return pollRequest(this.findRequest(job.branch));
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
// Local landing: the base branch only moves by a fast-forward to the exact SHA, never under a dirty checkout.
export class NoneForge implements Forge {
  private root: string;
  private gitCommand: Command;
  constructor(root: string, gitCommand: Command = command) {
    this.root = root;
    this.gitCommand = gitCommand;
  }
  private git(args: string[]) {
    return this.gitCommand("git", args, { cwd: this.root });
  }
  private async ancestor(older: string, newer: string) {
    try {
      await this.git(["merge-base", "--is-ancestor", older, newer]);
      return true;
    } catch (error) {
      if ((error as { code?: unknown }).code === 1) return false;
      throw error;
    }
  }
  async base(branch?: string) {
    branch ??= await this.git(["branch", "--show-current"]);
    if (!branch)
      throw new Error("Check out a branch for local issues to start from");
    return { branch, ref: branch };
  }
  async deliver(input: Delivery): Promise<Delivered> {
    const ref = `refs/heads/${input.base}`;
    let current = "";
    try {
      current = await this.git(["rev-parse", ref]);
      if (!(await this.ancestor(current, input.sha))) return { state: "moved" };
      if ((await this.git(["branch", "--show-current"])) === input.base) {
        if (await this.git(["status", "--porcelain"]))
          return {
            state: "refused",
            reason: `${input.base} is checked out with uncommitted changes`,
          };
        await this.git(["merge", "--ff-only", input.sha]);
      } else await this.git(["update-ref", ref, input.sha, current]);
      return { state: "landed" };
    } catch (error) {
      // Compare-and-swap lost: the base moved since it was read.
      try {
        if ((await this.git(["rev-parse", ref])) !== current)
          return { state: "moved" };
      } catch {}
      return { state: "refused", reason: (error as Error).message };
    }
  }
  async poll(job: {
    branch: string;
    sha: string;
    base: string;
  }): Promise<Polled> {
    return {
      state: (await this.ancestor(job.sha, `refs/heads/${job.base}`))
        ? "landed"
        : "none",
    };
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

// Sets `status: closed` in issue `number`'s file under root; false when it is already closed or has no file.
// root is agent-written: throws unless every path component is a real directory and the file a regular file.
export async function closeIssueFile(
  root: string,
  number: number,
): Promise<boolean> {
  const prefix = join(root, ".sandcastle/specs");
  const files = existsSync(prefix)
    ? await readdir(prefix, { recursive: true })
    : [];
  for (const file of files.filter(
    (file) =>
      Number(/^\d+-[^/]+\/issues\/(\d+)[^/]*\.md$/.exec(file)?.[1]) === number,
  )) {
    const parts = [".sandcastle", "specs", ...file.split("/")];
    for (let i = 1; i <= parts.length; i++) {
      const stat = await lstat(join(root, ...parts.slice(0, i)));
      if (i === parts.length ? !stat.isFile() : !stat.isDirectory())
        throw new Error(
          `.sandcastle/specs/${file}: not a regular file inside the repository`,
        );
    }
    const text = await readFile(join(prefix, file), "utf8");
    const issue = localIssue(file, text);
    if (issue.number !== number) continue;
    if (issue.closed) return false;
    const front = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
    const start = text.indexOf("\n") + 1;
    await writeFile(
      join(prefix, file),
      !front
        ? `---\nstatus: closed\n---\n${text}`
        : text.slice(0, start) +
            (/^\s*status:/m.test(front[1])
              ? front[1].replace(/^\s*status:.*$/gm, "status: closed")
              : `${front[1]}\nstatus: closed`) +
            text.slice(start + front[1].length),
    );
    return true;
  }
  return false;
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
