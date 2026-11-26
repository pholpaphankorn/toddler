// `toddler smoke forge <github|gitlab> <scratch-repository>`: by hand only, never in CI or tests against a real forge.
// Opens a request one commit behind the base, pushes a host merge of the base, and reports the forge behaviours
// nobody has tried yet; then closes the request and deletes the branch.
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defaults, type Config } from "./config.ts";
import { GitHubForge, GitLabForge } from "./forge.ts";
import { command, type Command } from "./process.ts";

export const smokeForgeUsage =
  "Usage: toddler smoke forge <github|gitlab> <scratch-repository>  (a scratch repository you own: toddler opens, pushes to and closes a request there)";

export async function smokeForge(
  args: string[],
  run: Command = command,
  wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms)),
  log: (line: string) => void = console.log,
): Promise<void> {
  const [kind, repository] = args;
  // Never falls back to the current repository: the scratch one must be named.
  if (!["github", "gitlab"].includes(kind) || !repository?.includes("/"))
    throw new Error(smokeForgeUsage);
  const gitlab = kind === "gitlab";
  const cli = gitlab ? "glab" : "gh";
  const dir = await mkdtemp(join(tmpdir(), "toddler-forge-smoke-"));
  const git = (args: string[]) => run("git", args, { cwd: dir });
  const config = {
    ...defaults,
    forge: kind,
    repository,
    remote: "origin",
    autoMerge: true,
  } as Config;
  const forge = gitlab
    ? new GitLabForge(dir, config, run, run)
    : new GitHubForge(dir, config, run, run);
  const project = `projects/${encodeURIComponent(repository)}`;
  const branch = `toddler-smoke-${Date.now()}`;
  let url: string | undefined;
  const request = () =>
    `${project}/merge_requests/${/\/merge_requests\/(\d+)/.exec(url!)?.[1]}`;
  let pushed = false;
  // The raw fields each question turns on, read again until the forge has finished computing them.
  const read = async () => {
    for (let attempt = 0; ; attempt++) {
      const fields = JSON.parse(
        gitlab
          ? await run("glab", ["api", request()], { cwd: dir })
          : await run(
              "gh",
              [
                "pr",
                "view",
                url!,
                "--repo",
                repository,
                "--json",
                "state,mergeable,mergeStateStatus,autoMergeRequest",
              ],
              { cwd: dir },
            ),
      );
      const computing = gitlab
        ? ["checking", "unchecked", "preparing"].includes(
            fields.detailed_merge_status,
          )
        : !fields.mergeable || fields.mergeable === "UNKNOWN";
      if (!computing || attempt >= 11) return fields;
      await wait(5000);
    }
  };
  const describe = (fields: any) =>
    gitlab
      ? `state ${fields.state}, detailed_merge_status ${fields.detailed_merge_status}, merge_when_pipeline_succeeds ${fields.merge_when_pipeline_succeeds}`
      : `state ${fields.state}, mergeStateStatus ${fields.mergeStateStatus}, auto-merge ${fields.autoMergeRequest ? "on" : "off"}`;
  try {
    await run(cli, ["repo", "clone", repository, dir]);
    const { branch: base, ref } = await forge.base();
    // One commit behind the base, so the request starts out behind and the host merge has work to do.
    await git(["checkout", "-b", branch, `${ref}~1`]);
    await writeFile(join(dir, `${branch}.txt`), "toddler smoke forge\n");
    await git(["add", `${branch}.txt`]);
    await git(["commit", "-m", "toddler smoke forge (scratch)"]);
    const first = await git(["rev-parse", "HEAD"]);
    const delivery = {
      branch,
      base,
      title: "toddler smoke forge (scratch, closed when done)",
      body: "Opened by `toddler smoke forge`; it closes this request and deletes the branch when it finishes.",
    };
    pushed = true;
    const delivered = await forge.deliver({ ...delivery, sha: first });
    if (delivered.state !== "waiting")
      throw new Error(`deliver: ${JSON.stringify(delivered)}`);
    url = delivered.url;
    const before = await read();
    log(`opened: ${url} (${describe(before)})`);
    if (before.state === "MERGED" || before.state === "merged")
      throw new Error(
        "the request merged at once: give the scratch repository a required check that never reports (see README)",
      );
    await git(["merge", "--no-edit", ref]);
    const merge = await git(["rev-parse", "HEAD"]);
    // A plain push, as toddler's own deliver does, but without re-enabling auto-merge yet.
    await git(["push", "origin", `${merge}:refs/heads/${branch}`]);
    const after = await read();
    log(`host merge pushed: ${merge} (${describe(after)})`);
    if (gitlab)
      log(
        `GitLab source push aborts auto-merge: ${after.merge_when_pipeline_succeeds ? "no" : "yes"}`,
      );
    else
      log(
        `GitHub keeps auto-merge after a host push: ${!before.autoMergeRequest ? "untested (auto-merge was not on before the push)" : after.autoMergeRequest ? "yes" : "no"}`,
      );
    const redelivered = await forge.deliver({ ...delivery, sha: merge });
    const again = await read();
    log(
      `deliver again: ${redelivered.state === "refused" ? `refused: ${redelivered.reason}` : redelivered.state} (${describe(again)})`,
    );
    if (gitlab)
      log(
        `GitLab merge commit clears need_rebase: ${before.detailed_merge_status !== "need_rebase" ? `untested (was ${before.detailed_merge_status} before the push: not a fast-forward or semi-linear project)` : again.detailed_merge_status === "need_rebase" ? "no" : `yes (now ${again.detailed_merge_status})`}`,
      );
    else {
      const rules = await run(
        "gh",
        ["api", `repos/${repository}/rules/branches/${base}`],
        { cwd: dir },
      ).then(
        (text) =>
          JSON.parse(text).some(
            (rule: { type: string }) => rule.type === "required_linear_history",
          ),
        () => undefined,
      );
      const classic = await run(
        "gh",
        ["api", `repos/${repository}/branches/${base}/protection`],
        { cwd: dir },
      ).then(
        (text) => !!JSON.parse(text).required_linear_history?.enabled,
        () => undefined,
      );
      const linear =
        rules || classic
          ? "required"
          : rules === undefined && classic === undefined
            ? "unknown (rules unreadable)"
            : "not required";
      log(
        `GitHub linear history on ${base}: ${linear}; auto-merge on the host merge commit: ${redelivered.state === "refused" ? "refused" : "accepted"}`,
      );
    }
    const polled = await forge.poll({ branch, sha: merge, base });
    log(`poll: ${polled.state}`);
  } finally {
    // Cleanup runs whatever happened above; each step reports its own failure.
    if (url)
      await (
        gitlab
          ? run(
              "glab",
              [
                "api",
                request(),
                "--method",
                "PUT",
                "--raw-field",
                "state_event=close",
              ],
              { cwd: dir },
            )
          : run("gh", ["pr", "close", url, "--repo", repository], { cwd: dir })
      ).then(
        () => log(`closed: ${url}`),
        (error: Error) => log(`could not close ${url}: ${error.message}`),
      );
    if (pushed)
      await git(["push", "origin", "--delete", branch]).then(
        () => log(`deleted branch: ${branch}`),
        (error: Error) =>
          log(`could not delete branch ${branch}: ${error.message}`),
      );
    await rm(dir, { recursive: true, force: true });
  }
}
