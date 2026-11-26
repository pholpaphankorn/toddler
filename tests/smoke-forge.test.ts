import { test } from "node:test";
import assert from "node:assert/strict";
import { smokeForge } from "../src/smoke-forge.ts";

test("smoke forge refuses without a named scratch repository", async () => {
  for (const args of [
    [],
    ["github"],
    ["gitlab", "project"],
    ["bitbucket", "o/r"],
  ])
    await assert.rejects(
      smokeForge(args, async () => assert.fail("nothing may run")),
      /scratch-repository/,
    );
});

// A fake gh + git: the request is behind with auto-merge on, and the host push turns auto-merge off.
function fakeGitHub(failMerge: boolean, status = "BEHIND", origin = "") {
  const calls: string[] = [];
  let heads = 0;
  let pushed = false;
  let created = false;
  const run = async (file: string, args: string[] = []) => {
    const call = [file, ...args].join(" ");
    calls.push(call);
    if (file === "git") {
      if (args[1] === "--show-toplevel") return "/nonexistent-project";
      if (args[0] === "remote") return origin;
      if (args[0] === "rev-parse") return `sha${++heads}`;
      if (args[0] === "merge" && failMerge) throw new Error("merge failed");
      if (args[0] === "push" && args[2]?.startsWith("sha2:")) pushed = true;
      return "";
    }
    if (call.includes("defaultBranchRef"))
      return JSON.stringify({ defaultBranchRef: { name: "main" } });
    if (call.includes("viewerDefaultMergeMethod"))
      return JSON.stringify({ viewerDefaultMergeMethod: "MERGE" });
    if (args[0] === "api" && args[1] === "repos/o/r")
      return JSON.stringify({ allow_merge_commit: true });
    if (args[1]?.includes("/rules/branches/"))
      return JSON.stringify([{ type: "required_linear_history" }]);
    if (args[1]?.endsWith("/protection")) throw new Error("HTTP 404");
    if (args[1] === "create") {
      created = true;
      return "https://github.com/o/r/pull/5";
    }
    if (args[1] === "view")
      return JSON.stringify({
        state: "OPEN",
        mergeable: "MERGEABLE",
        mergeStateStatus: pushed ? "BLOCKED" : status,
        autoMergeRequest: pushed ? null : { mergeMethod: "MERGE" },
      });
    if (args[1] === "list" && args.includes("url,state"))
      return JSON.stringify(
        created
          ? [{ url: "https://github.com/o/r/pull/5", state: "OPEN" }]
          : [],
      );
    if (args[1] === "list")
      return JSON.stringify([
        {
          url: "https://github.com/o/r/pull/5",
          state: "OPEN",
          headRefOid: "sha2",
          mergeable: "MERGEABLE",
          mergeStateStatus: "BLOCKED",
          reviewDecision: null,
          autoMergeRequest: null,
          statusCheckRollup: [],
        },
      ]);
    return "";
  };
  return { calls, run };
}

test("smoke forge reports what GitHub did, then closes the request and deletes the branch", async () => {
  const { calls, run } = fakeGitHub(false);
  const lines: string[] = [];
  await smokeForge(
    ["github", "o/r"],
    run,
    async () => {},
    (line) => lines.push(line),
  );
  const branch = /infant-smoke-\d+/.exec(lines.join("\n"))![0];
  assert.deepEqual(
    lines.map((line) => line.replace(branch, "BRANCH")),
    [
      "opened: https://github.com/o/r/pull/5 (state OPEN, mergeStateStatus BEHIND, auto-merge on)",
      "host merge pushed: sha2 (state OPEN, mergeStateStatus BLOCKED, auto-merge off)",
      "GitHub keeps auto-merge after a host push: no",
      "deliver again: waiting (state OPEN, mergeStateStatus BLOCKED, auto-merge off)",
      "GitHub linear history on main: required; auto-merge on the host merge commit: accepted",
      "poll: auto-merge-off",
      "closed: https://github.com/o/r/pull/5",
      "deleted branch: BRANCH",
    ],
  );
  // The branch starts one commit behind the base; the host merge goes out as a plain push.
  assert.ok(calls.includes(`git checkout -b ${branch} origin/main~1`));
  assert.ok(calls.includes(`git push origin sha2:refs/heads/${branch}`));
});

test("smoke forge cleans up when a step fails", async () => {
  const { calls, run } = fakeGitHub(true);
  const lines: string[] = [];
  await assert.rejects(
    smokeForge(
      ["github", "o/r"],
      run,
      async () => {},
      (line) => lines.push(line),
    ),
    /merge failed/,
  );
  assert.ok(
    calls.includes("gh pr close https://github.com/o/r/pull/5 --repo o/r"),
  );
  assert.ok(
    calls.some((call) =>
      /^git push origin --delete infant-smoke-\d+$/.test(call),
    ),
  );
});

test("smoke forge refuses the current project's own repository before touching it", async () => {
  const { calls, run } = fakeGitHub(false, "BEHIND", "git@github.com:o/r.git");
  await assert.rejects(
    smokeForge(
      ["github", "o/r"],
      run,
      async () => {},
      () => {},
    ),
    /current project's repository/,
  );
  assert.ok(!calls.some((call) => /clone|^git push|^gh pr/.test(call)));
});

test("smoke forge never turns auto-merge on for a request that could merge at once", async () => {
  const { calls, run } = fakeGitHub(false, "CLEAN");
  await assert.rejects(
    smokeForge(
      ["github", "o/r"],
      run,
      async () => {},
      () => {},
    ),
    /could merge at once.*auto-merge was not turned on/,
  );
  assert.ok(!calls.some((call) => call.startsWith("gh pr merge")));
  assert.ok(
    calls.includes("gh pr close https://github.com/o/r/pull/5 --repo o/r"),
  );
  assert.ok(
    calls.some((call) =>
      /^git push origin --delete infant-smoke-\d+$/.test(call),
    ),
  );
});
