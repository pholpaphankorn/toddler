import { test } from "node:test";
import assert from "node:assert/strict";
import { GitLabForge } from "../src/forge.ts";
import { defaults, type Config } from "../src/config.ts";

const config = {
  ...defaults,
  forge: "gitlab",
  repository: "group/sub/project",
  issueLabel: "workflow::ready",
} as Config;

test("GitLab tracker lists iids and checks native and body blockers", async () => {
  const calls: string[] = [];
  const glab = async (_: string, args: string[] = []) => {
    const path = args.find((a) => a.startsWith("projects/"))!;
    calls.push(path);
    if (path.includes("/links"))
      return JSON.stringify([
        { link_type: "is_blocked_by", state: "closed" },
        { link_type: "relates_to", state: "opened" },
      ]);
    if (path.endsWith("/issues/12")) return JSON.stringify({ state: "closed" });
    if (path.endsWith("/issues/15")) return JSON.stringify({ state: "opened" });
    if (path.includes("/notes")) return JSON.stringify([{ body: "note" }]);
    return JSON.stringify([
      {
        iid: 2,
        title: "Two",
        description: "Blocked by: #12\nblocked BY: #15",
        labels: ["workflow::ready"],
      },
    ]);
  };
  const tracker = new GitLabForge(".", config, async () => "", glab).tracker;
  const [issue] = await tracker.issues();
  assert.equal(issue.number, 2);
  assert.deepEqual(issue.labels, ["workflow::ready"]);
  assert.equal(await tracker.blocked(issue), true);
  assert.equal(
    await tracker.blocked({ ...issue, body: "Mention Blocked by: #15" }),
    false,
  );
  assert.deepEqual(await tracker.comments(issue), ["note"]);
  assert.ok(
    calls[0].includes(
      "projects/group%2Fsub%2Fproject/issues?state=opened&labels=workflow%3A%3Aready",
    ),
  );
});

test("GitLab blockers fail closed and log unresolvable lines", async () => {
  let native = false;
  const tracker = new GitLabForge(
    ".",
    config,
    async () => "",
    async (_, args = []) => {
      if (args[1].includes("/links"))
        return JSON.stringify(
          native ? [{ link_type: "is_blocked_by", state: "opened" }] : [],
        );
      throw new Error("not found");
    },
  ).tracker;
  const issue = { number: 3, title: "", labels: [], body: "" };
  native = true;
  assert.equal(await tracker.blocked(issue), true);
  native = false;
  const messages: string[] = [];
  const original = console.error;
  console.error = (...args) => messages.push(args.join(" "));
  try {
    assert.equal(
      await tracker.blocked({ ...issue, body: "Blocked by: #99" }),
      true,
    );
    assert.equal(
      await tracker.blocked({ ...issue, body: "Blocked by: group/other#4" }),
      true,
    );
    assert.equal(messages.length, 2);
    assert.match(messages.join("\n"), /#99.*group\/other#4/s);
  } finally {
    console.error = original;
  }
});

test("GitLab fetches, finds and opens merge requests", async () => {
  let requests = [
    { state: "closed", web_url: "closed" },
    { state: "merged", web_url: "merged" },
  ];
  const calls: string[][] = [];
  const forge = new GitLabForge(
    ".",
    config,
    async (_, args = []) => {
      calls.push(["git", ...args]);
      return "";
    },
    async (_, args = []) => {
      calls.push(["glab", ...args]);
      if (args.includes("POST")) return JSON.stringify({ web_url: "created" });
      if (args[1].includes("merge_requests?")) return JSON.stringify(requests);
      return JSON.stringify({ default_branch: "main" });
    },
  );
  assert.deepEqual(await forge.base(), { branch: "main", ref: "origin/main" });
  assert.deepEqual(await forge.findRequest("feature/a"), {
    url: "merged",
    open: false,
  });
  requests = [{ state: "opened", web_url: "opened" }];
  assert.deepEqual(await forge.findRequest("feature/a"), {
    url: "opened",
    open: true,
  });
  requests = [{ state: "closed", web_url: "closed" }];
  assert.equal(await forge.findRequest("feature/a"), undefined);
  assert.equal(
    await forge.openRequest({
      branch: "feature/a",
      sha: "abc",
      base: "main",
      title: "Title",
      body: "Closes #3",
    }),
    "created",
  );
  assert.ok(calls.some((call) => call.includes("description=Closes #3")));
  assert.ok(
    calls.some(
      (call) =>
        call.includes("source_branch=feature%2Fa&per_page=100") ||
        call.some((arg) => arg.includes("source_branch=feature%2Fa")),
    ),
  );
  assert.ok(
    calls.some(
      (call) => call.join(" ") === "git push origin abc:refs/heads/feature/a",
    ),
  );
});
