import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { closeIssueFile, type Delivered, type Polled } from "./forge.ts";
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

// Something an agent can fix blocks the merge: the job goes back for a merge fix round.
class MergeFixNeeded extends Error {
  fix: NonNullable<Job["mergeFix"]>;
  constructor(fix: NonNullable<Job["mergeFix"]>) {
    super(`merge fix: ${fix.trigger}`);
    this.fix = fix;
  }
}

// What a job left landing as; undefined when the run was interrupted (state is left to resume).
export type LandingEvent =
  "landed" | "approved" | "attention" | "merge-fix" | undefined;

// Gets approved jobs into the base: host merge + verify + deliver one job at a time, then polls until landed.
export class Landing {
  jobs = new Set<number>();
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
  // Once per run: a request left to phol (no auto-merge) that was merged by hand becomes landed.
  async recheck(): Promise<void> {
    const { config, forge, state } = this.runner;
    if (config.autoMerge || config.forge === "none") return;
    for (const job of Object.values(state.jobs)) {
      if (job.status !== "approved" || !job.pr) continue;
      try {
        const { state: polled } = await forge.poll({
          branch: job.branch,
          sha: job.deliveredSha ?? job.reviewedSha!,
          base: job.baseBranch,
        });
        if (polled !== "landed") continue;
        this.runner.persist(job, { status: "landed", attention: undefined });
        this.runner.landedThisRun.add(job.number);
        console.log(`[issue #${job.number}] landed on ${job.baseBranch}`);
      } catch (error) {
        console.error(
          `[issue #${job.number}] could not poll ${job.pr}: ${(error as Error).message}`,
        );
      }
    }
  }
  private async follow(issue: Issue, job: Job): Promise<LandingEvent> {
    const { forge, config } = this.runner;
    // Build on what was already pushed, so the next plain push fast-forwards it.
    let sha = (await this.pushed(job)) ?? job.reviewedSha!;
    const poll = async (): Promise<Polled> => {
      const polled = await forge.poll({
        branch: job.branch,
        sha,
        base: job.baseBranch,
      });
      const head = polled.head;
      if (!head || head === sha) return polled;
      // A head object missing locally is no push of ours.
      const is = (older: string, newer: string) =>
        this.ancestor(older, newer).catch(() => false);
      // Toddler's own earlier push (before a merge fix round, or a push that then failed): a plain push fast-forwards it.
      if (await is(head, sha)) return { state: "none" };
      // Host commits pushed on reviewedSha but not recorded: carry on from them once proven.
      if (await is(job.reviewedSha!, head)) {
        const { ref } = await forge.base(job.baseBranch);
        await this.prove(job, head, await this.runner.git(["rev-parse", ref]));
        sha = head;
        this.runner.persist(job, { deliveredSha: sha });
        return polled;
      }
      throw new AttentionError(
        "refused",
        `${job.pr ?? job.branch} head is ${head}, not ${sha}: someone else pushed; refusing to land it`,
      );
    };
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
        case "behind":
        case "conflict": {
          let result;
          try {
            result = await this.serial(() => this.deliver(issue, job, sha));
          } catch (error) {
            if (!(error instanceof MergeFixNeeded)) throw error;
            return await this.mergeFix(job, error.fix);
          }
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
        case "ci-failed":
          return await this.mergeFix(job, {
            trigger: "ci-failed",
            checks: polled.checks,
          });
      }
      await this.runner.clock.wait(
        config.landingPollSeconds * 1000,
        this.runner.stopping.signal,
      );
      if (this.runner.interrupted) return;
      polled = await poll();
    }
  }
  // The host commits last handed to the forge on top of reviewedSha (host merges, close commit), if any.
  private async pushed(job: Job): Promise<string | undefined> {
    const sha = job.deliveredSha;
    if (
      sha &&
      sha !== job.reviewedSha &&
      (await this.ancestor(job.reviewedSha!, sha))
    )
      return sha;
  }
  // One trigger = one round; the job leaves landing and takes a slot ahead of fresh issues.
  // The round starts from the pushed head (`from`), so its result fast-forwards the PR branch.
  private async mergeFix(
    job: Job,
    fix: NonNullable<Job["mergeFix"]>,
  ): Promise<LandingEvent> {
    const from = await this.pushed(job);
    if (from) fix = { ...fix, from };
    if (job.mergeFixRounds >= this.runner.config.maxMergeFixRounds)
      throw new AttentionError(
        "merge-fix-cap",
        `Merge fix round limit reached (${fix.trigger}); needs human attention`,
      );
    this.runner.persist(job, {
      status: "implementation",
      mergeFix: fix,
      mergeFixRounds: job.mergeFixRounds + 1,
      reviewRounds: 0,
      feedback: undefined,
    });
    console.log(
      `[issue #${job.number}] ${fix.trigger}: merge fix round ${job.mergeFixRounds}`,
    );
    return "merge-fix";
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
        await this.verify(job, sha, base);
        if (runner.interrupted) return;
      }
      await this.prove(job, sha, base);
      // Recorded before the push: on resume the next round or delivery builds on it either way.
      if (runner.config.forge !== "none")
        runner.persist(job, { deliveredSha: sha });
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
        if ((error as { code?: unknown }).code === 1)
          throw new MergeFixNeeded({ trigger: "conflict", base });
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
  private async verify(job: Job, sha: string, base: string): Promise<void> {
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
      // The failure is in the merged result, so the round starts from the same merge.
      if (exitCode)
        throw new MergeFixNeeded({
          trigger: "verify",
          base,
          output: logTail(
            stdout && !stdout.endsWith("\n")
              ? `${stdout}\n${stderr}`
              : stdout + stderr,
          ),
        });
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
