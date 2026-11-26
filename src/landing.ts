import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { closeIssueFile, type Delivered } from "./forge.ts";
import { logTail } from "./logtail.ts";
import type { Issue } from "./policy.ts";
import type { Job, Runner } from "./runner.ts";

export class AttentionError extends Error {
  reason: NonNullable<Job["attention"]>["reason"];
  log?: string;
  constructor(
    reason: NonNullable<Job["attention"]>["reason"],
    message: string,
    log?: string,
  ) {
    super(message);
    this.reason = reason;
    this.log = log;
  }
}

// What a job left landing as; undefined when the run was interrupted (state is left to resume).
// #87 adds "merge-fix".
export type LandingEvent = "landed" | "approved" | "attention" | undefined;

// Gets approved jobs into the base: host merge + verify + deliver one job at a time, then polls until landed.
export class Landing {
  jobs = new Set<number>();
  pollInterval = 60_000;
  private runner: Runner;
  private turn: Promise<void> = Promise.resolve();
  constructor(runner: Runner) {
    this.runner = runner;
  }
  async land(issue: Issue): Promise<LandingEvent> {
    const job = this.runner.state.jobs[issue.number];
    this.jobs.add(issue.number);
    let event: LandingEvent = "attention";
    try {
      await this.runner.attend(issue, job, async () => {
        event = await this.follow(issue, job);
      });
      return event;
    } finally {
      this.jobs.delete(issue.number);
    }
  }
  private async follow(issue: Issue, job: Job): Promise<LandingEvent> {
    const { forge, config } = this.runner;
    let sha = job.reviewedSha!;
    const poll = () =>
      forge.poll({ branch: job.branch, sha, base: job.baseBranch });
    // Resume re-checks the forge (or the local base) before acting.
    let polled = await poll();
    while (!this.runner.interrupted) {
      switch (polled.state) {
        case "landed":
          this.runner.persist(job, { status: "landed" });
          this.runner.landedThisRun.add(job.number);
          console.log(`[issue #${job.number}] landed on ${job.baseBranch}`);
          return "landed";
        case "none":
        case "behind": {
          const result = await this.serial(() => this.deliver(issue, job, sha));
          if (!result) return;
          sha = result.sha;
          const { delivered } = result;
          if (delivered.state === "refused")
            throw new AttentionError("refused", delivered.reason);
          if (delivered.state === "landed") {
            polled = { state: "landed" };
            continue;
          }
          if (delivered.state === "waiting") {
            this.runner.persist(job, {
              status: config.autoMerge ? "landing" : "approved",
              pr: delivered.url,
            });
            console.log(`[issue #${job.number}] ${delivered.url}`);
            if (!config.autoMerge) return "approved";
          }
          break;
        }
        case "waiting":
          break;
        case "closed":
          throw new AttentionError(
            "request-closed",
            `${job.pr ?? job.branch} was closed`,
          );
        case "review-required":
          throw new AttentionError(
            "review-required",
            `${job.pr ?? job.branch} requires a human review`,
          );
        case "auto-merge-off":
          throw new AttentionError(
            "auto-merge-off",
            `auto-merge was turned off on ${job.pr ?? job.branch}`,
          );
        default:
          // #87: conflict and ci-failed become merge fixes.
          throw new Error(`${job.pr ?? job.branch}: ${polled.state}`);
      }
      await this.runner.wait(this.pollInterval);
      polled = await poll();
    }
  }
  private async serial<T>(action: () => Promise<T>): Promise<T> {
    const previous = this.turn;
    let release!: () => void;
    this.turn = new Promise<void>((resolve) => (release = resolve));
    await previous;
    try {
      return await action();
    } finally {
      release();
    }
  }
  // Holds the landing turn: merge the base in when it moved, verify, hand the exact SHA to the forge.
  private async deliver(
    issue: Issue,
    job: Job,
    sha: string,
  ): Promise<{ sha: string; delivered: Delivered } | undefined> {
    const runner = this.runner;
    if ((await runner.git(["rev-parse", job.branch])) !== job.reviewedSha)
      throw new AttentionError(
        "refused",
        "Branch changed after review; refusing to publish",
      );
    if (sha === job.reviewedSha) sha = (await this.close(job)) ?? sha;
    while (!runner.interrupted) {
      const { ref } = await runner.forge.base(job.baseBranch);
      const base = await runner.git(["rev-parse", ref]);
      if (!(await this.ancestor(base, sha))) {
        sha = await this.merge(job, sha, base);
        await this.verify(job, sha);
        if (runner.interrupted) return;
      }
      await this.prove(job, sha, base);
      const delivered = await runner.forge.deliver({
        branch: job.branch,
        sha,
        base: job.baseBranch,
        ...this.request(issue, job),
      });
      if (delivered.state !== "moved") return { sha, delivered };
      console.log(
        `[issue #${job.number}] ${job.baseBranch} moved; merging again`,
      );
    }
  }
  private async ancestor(older: string, newer: string): Promise<boolean> {
    try {
      await this.runner.git(["merge-base", "--is-ancestor", older, newer]);
      return true;
    } catch (error) {
      if ((error as { code?: unknown }).code === 1) return false;
      throw error;
    }
  }
  // Files tracker only: the host's commit on reviewedSha that sets the issue file to closed; undefined when it already is.
  private async close(job: Job): Promise<string | undefined> {
    const runner = this.runner;
    if (!runner.local()) return;
    const directory = await mkdtemp(join(tmpdir(), "toddler-close-"));
    try {
      await runner.git([
        "worktree",
        "add",
        "--detach",
        directory,
        job.reviewedSha!,
      ]);
      const closing = await closeIssueFile(directory, job.number).catch(
        (error) => {
          throw new AttentionError("refused", (error as Error).message);
        },
      );
      if (!closing) return;
      await runner.git(
        ["commit", "--no-verify", "-qam", `Close local issue ${job.number}`],
        directory,
      );
      return await runner.git(["rev-parse", "HEAD"], directory);
    } finally {
      await runner.git(["worktree", "remove", "--force", directory]);
      await rm(directory, { recursive: true, force: true });
    }
  }
  // First-parent from sha down to reviewedSha: at most one close commit right on reviewedSha, then clean host merges
  // of the base. Proven by recomputing each tree, never by trusting authors or messages.
  private async prove(job: Job, sha: string, base: string): Promise<void> {
    const git = (args: string[]) => this.runner.git(args);
    const tree = (commit: string) => git(["rev-parse", `${commit}^{tree}`]);
    for (let commit = sha; commit !== job.reviewedSha;) {
      const [, first, second, ...more] = (
        await git(["rev-list", "--parents", "-n", "1", commit])
      ).split(" ");
      let expected: string | undefined;
      if (second && !more.length && (await this.ancestor(second, base)))
        expected = await git(["merge-tree", "--write-tree", first, second])
          .then((output) => output.split("\n")[0])
          .catch((error) => {
            if (error.code === 1) return undefined; // conflicted: not a clean host merge
            throw error;
          });
      else if (first === job.reviewedSha && !second) {
        const close = await this.close(job);
        expected = close && (await tree(close));
      }
      if (!expected || expected !== (await tree(commit)))
        throw new AttentionError(
          "refused",
          `${commit} on ${job.branch} is neither the reviewed work nor a host merge or close commit; refusing to publish`,
        );
      commit = first;
    }
  }
  // A throwaway host worktree, so phol's checkout is never touched.
  private async merge(job: Job, sha: string, base: string): Promise<string> {
    const runner = this.runner;
    const directory = await mkdtemp(join(tmpdir(), "toddler-merge-"));
    try {
      await runner.git(["worktree", "add", "--detach", directory, sha]);
      try {
        await runner.gitCommand(
          "git",
          [
            "merge",
            "--no-ff",
            "--no-verify",
            "-m",
            `Merge ${job.baseBranch} into ${job.branch}`,
            base,
          ],
          { cwd: directory },
        );
      } catch (error) {
        // #87: a conflict becomes a merge fix.
        throw new Error(
          `Host merge of ${job.baseBranch} (${base}) into ${job.branch} failed: ${(error as Error).message}`,
        );
      }
      return await runner.git(["rev-parse", "HEAD"], directory);
    } finally {
      await runner.git(["worktree", "remove", "--force", directory]);
      await rm(directory, { recursive: true, force: true });
    }
  }
  // The command is trusted, but what it runs is agent-written repo code: a sandbox with no agent, never the host.
  private async verify(job: Job, sha: string): Promise<void> {
    const { config, sandcastle, sandboxProvider } = this.runner;
    if (!config.verify.trim()) return;
    const branch = `toddler/verify-${job.number}-${sha.slice(0, 12)}`;
    const sandbox = await sandcastle!.createSandbox({
      cwd: this.runner.root,
      branch,
      baseBranch: sha,
      sandbox: sandboxProvider!,
    });
    try {
      if (
        config.install.trim() &&
        (await sandbox.exec(config.install)).exitCode
      )
        throw new Error(`Sandbox install failed: ${config.install}`);
      const { exitCode, stdout, stderr } = await sandbox.exec(config.verify);
      if (exitCode)
        // #87: a failing verify becomes a merge fix.
        throw new Error(
          `Host merge failed verification: ${config.verify}\n${logTail(stdout && !stdout.endsWith("\n") ? `${stdout}\n${stderr}` : stdout + stderr)}`,
        );
    } finally {
      await sandbox.close();
      // Best effort: a preserved worktree keeps its branch.
      await this.runner.git(["branch", "-D", branch]).catch(() => {});
    }
  }
  private request(issue: Issue, job: Job) {
    const { config, tracker } = this.runner;
    const { ref, closes } = tracker.requestReference(issue);
    return {
      title: `Fix ${ref}: ${issue.title}`.slice(0, 200),
      body: `## Summary\n\nIssue ${ref} → implementation → review → ${config.forge === "gitlab" ? "merge" : "pull"} request\n\n${job.report!.summary}\n\n${closes}## Evidence\n\n- **Before:** Issue ${ref} was open when assigned.\n- **After:** ${job.report!.validation}\n\n${config.verify.trim() ? `Coordinator verification (\`${config.verify}\`): passed.` : "Coordinator verification: none configured."}\n\nReviewed by ${config.roles.review.models[job.reviewer!]} at ${job.reviewedSha}.\n\n## Merge Danger\n\n**Door:** two-way\n\n**Blast Radius:** ${config.repository}\n\nReview the diff and any manual QA limitations before merging.\n`,
    };
  }
}
