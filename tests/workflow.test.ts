import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import {
  assignments,
  localIssue,
  reviewer,
  reviewReport,
} from "../src/policy.ts";
import {
  Quotas,
  codexUsage,
  claudeUsage,
  validateUsage,
  weeklyLeft,
  readUsage,
  type Reading,
} from "../src/quota.ts";
import { Runner, type Job, type RunnerOptions } from "../src/runner.ts";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  defaults,
  loadConfig,
  providers,
  type Config,
  type Provider,
} from "../src/config.ts";
import { indexSkills } from "../src/skills.ts";

// Test doubles implement only what each test exercises.
const fake = <T>(value: unknown) => value as T;
const config: Config = {
  ...defaults,
  repository: "example/repo",
  verify: "make check",
  install: "",
};

const now = Date.now();
const usage = (remainingPercent: number): Reading => ({
  fiveHour: {
    remainingPercent,
    resetsAt: Math.floor(Date.now() / 1000) + 1000,
  },
  weekly: null,
  weeklyByModel: {},
  observedAt: Date.now(),
});
const issue = (number: number, labels: string[] = []) => ({
  number,
  labels,
  title: `Issue ${number}`,
  body: "Fix the behavior",
});
const report = (verdict = "approved") =>
  `<sandcastle-review>${JSON.stringify({
    verdict,
    findings: verdict === "approved" ? [] : ["Fix incorrect handling"],
    summary: "Corrected the handling",
    validation: "Checks passed",
  })}</sandcastle-review>`;

test("one issue prefers Codex; fallback and explicit independent parallel issues", () => {
  assert.equal(
    assignments([issue(1)], () => true, config)[0].provider,
    "codex",
  );
  assert.equal(
    assignments([issue(1)], (name) => name === "claude", config)[0].provider,
    "claude",
  );
  assert.equal(assignments([issue(1), issue(2)], () => true, config).length, 1);
  assert.deepEqual(
    assignments(
      [issue(1, ["parallel-safe"]), issue(2, ["parallel-safe"])],
      () => true,
      config,
    ).map(({ issue, provider }) => [issue.number, provider]),
    [
      [1, "codex"],
      [2, "claude"],
    ],
  );
  assert.equal(
    assignments([issue(1, ["blocked"]), issue(2)], () => true, config)[0].issue
      .number,
    2,
  );
  assert.equal(assignments([issue(1)], () => false, config).length, 0);
});
test("opposite-provider review, same-provider fallback, no reviewer when exhausted", () => {
  assert.equal(
    reviewer("codex", () => true),
    "claude",
  );
  assert.equal(
    reviewer("claude", () => true),
    "codex",
  );
  assert.equal(
    reviewer("claude", (name) => name === "claude"),
    "claude",
  );
  assert.equal(
    reviewer("claude", () => false),
    undefined,
  );
});
test("Claude parses limits and ignores unrelated and surface rows", () => {
  const reset = new Date(now + 100000).toISOString();
  const reading = claudeUsage(
    {
      limits: [
        { kind: "session", percent: 20, resets_at: reset },
        { kind: "weekly_all", percent: 30, resets_at: null },
        {
          kind: "weekly_scoped",
          percent: 80,
          resets_at: reset,
          scope: { model: { display_name: "Fable 5" } },
        },
        {
          kind: "weekly_scoped",
          percent: 100,
          scope: { surface: {}, model: { display_name: "ignored" } },
        },
        { kind: "seven_day_oauth_apps", percent: 100 },
      ],
    },
    now,
  );
  assert.equal(reading.fiveHour?.remainingPercent, 80);
  assert.equal(reading.fiveHour?.resetsAt, (now + 100000) / 1000);
  assert.equal(reading.weekly?.remainingPercent, 70);
  assert.deepEqual(Object.keys(reading.weeklyByModel), ["Fable 5"]);
  assert.equal(weeklyLeft(reading, "claude-fable-5", "claude"), 20);
  assert.equal(weeklyLeft(reading, "claude-other", "claude"), 70);
  assert.equal(
    claudeUsage(
      {
        limits: [
          { kind: "weekly_all", percent: 25 },
          { kind: "session", percent: null },
        ],
      },
      now,
    ).fiveHour,
    null,
  );
  assert.throws(() => claudeUsage({}, now));
  assert.throws(() => claudeUsage({ limits: [] }, now));
});
test("Claude ignores invalid percentages in unrelated and unscoped rows", () => {
  const reading = claudeUsage(
    fake({
      limits: [
        { kind: "weekly_all", percent: 20 },
        { kind: "seven_day_oauth_apps", percent: "unknown" },
        { kind: "weekly_scoped", percent: "unknown", scope: {} },
      ],
    }),
    now,
  );
  assert.equal(reading.weekly?.remainingPercent, 80);
  assert.deepEqual(reading.weeklyByModel, {});
});
test("Codex identifies windows and per-model weekly buckets", () => {
  const weekly = { windowDurationMins: 10080, usedPercent: 25, resetsAt: null };
  const reading = codexUsage(
    {
      rateLimitsByLimitId: {
        codex: { primary: weekly },
        other: {
          normalModelSlug: "GPT-X",
          secondary: { ...weekly, usedPercent: 90 },
        },
        empty: { normalModelSlug: "ignored" },
      },
    },
    now,
  );
  assert.equal(reading.fiveHour, null);
  assert.equal(reading.weekly?.remainingPercent, 75);
  assert.equal(weeklyLeft(reading, "gpt-x", "codex"), 10);
  assert.equal(weeklyLeft(reading, "gpt-x-extra", "codex"), 75);
  assert.deepEqual(
    codexUsage({ rateLimits: { limitId: "codex" } }, now).weekly,
    null,
  );
  assert.throws(() => codexUsage({}, now));
});
test("quota validation rejects stale and invalid data and resets past windows", () => {
  assert.throws(() =>
    validateUsage({ ...usage(50), observedAt: now - 61000 }, now),
  );
  assert.throws(() =>
    validateUsage(
      { ...usage(50), fiveHour: { remainingPercent: NaN, resetsAt: null } },
      now,
    ),
  );
  assert.throws(() =>
    validateUsage(
      { ...usage(50), weekly: { remainingPercent: 101, resetsAt: null } },
      now,
    ),
  );
  assert.throws(() =>
    validateUsage(
      { ...usage(50), weekly: { remainingPercent: 50, resetsAt: NaN } },
      now,
    ),
  );
  assert.equal(
    validateUsage(
      {
        ...usage(50),
        fiveHour: { remainingPercent: 0, resetsAt: now / 1000 - 1 },
      },
      now,
    ).fiveHour?.remainingPercent,
    100,
  );
  assert.throws(
    () =>
      validateUsage(
        { remainingPercent: 50, resetsAt: 1, observedAt: now } as never,
        now,
      ),
    /README/,
  );
});
test("old override JSON is rejected with README guidance", async () => {
  const previous = process.env.CODEX_USAGE_COMMAND;
  process.env.CODEX_USAGE_COMMAND = `printf '%s' '{"remainingPercent":50,"resetsAt":1,"observedAt":${Date.now()}}'`;
  try {
    await assert.rejects(readUsage("codex", config), /README/);
  } finally {
    if (previous === undefined) delete process.env.CODEX_USAGE_COMMAND;
    else process.env.CODEX_USAGE_COMMAND = previous;
  }
});
test("a scoped weekly stop persists only for the matching model", async () => {
  let remaining = 10;
  const scopedConfig = {
    ...config,
    models: {
      ...config.models,
      claude: { implementation: "claude-sonnet", review: "claude-fable-5" },
    },
  };
  const quotas = new Quotas(scopedConfig, async () => ({
    ...usage(50),
    weeklyByModel: { Fable: { remainingPercent: remaining, resetsAt: null } },
  }));
  await quotas.refresh();
  assert.equal(quotas.available("claude", "claude-fable-5"), false);
  assert.equal(quotas.available("claude", "claude-sonnet"), true);
  remaining = 100;
  await quotas.refresh();
  assert.equal(quotas.available("claude", "claude-fable-5"), false);
});
test("a model stop aborts only sessions on that model", async () => {
  let remaining = 50;
  const scopedConfig = {
    ...config,
    models: {
      ...config.models,
      claude: { implementation: "claude-sonnet", review: "claude-fable" },
    },
  };
  const quotas = new Quotas(scopedConfig, async () => ({
    ...usage(50),
    weeklyByModel: { Fable: { remainingPercent: remaining, resetsAt: null } },
  }));
  let reviewSignal!: AbortSignal;
  let implementationSignal!: AbortSignal;
  let finish!: () => void;
  const pending = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const review = quotas.run("claude", "claude-fable", async (signal) => {
    reviewSignal = signal;
    await pending;
  });
  const implementation = quotas.run(
    "claude",
    "claude-sonnet",
    async (signal) => {
      implementationSignal = signal;
      await pending;
    },
  );
  await new Promise((resolve) => setTimeout(resolve, 0));
  remaining = 10;
  await quotas.refresh();
  assert.equal(reviewSignal.aborted, true);
  assert.equal(implementationSignal.aborted, false);
  finish();
  await Promise.all([review, implementation]);
});
test("weekly stop affects only its provider", async () => {
  const quotas = new Quotas(config, async (provider) => ({
    ...usage(50),
    weekly: {
      remainingPercent: provider === "claude" ? 10 : 11,
      resetsAt: null,
    },
  }));
  await quotas.refresh();
  assert.equal(quotas.available("claude"), false);
  assert.equal(quotas.available("codex"), true);
});
test("at 5% both roles stop; no automatic reset/restart within a run", async () => {
  let remaining = 5;
  const quotas = new Quotas(config, async () => usage(remaining));
  await quotas.refresh();
  assert.equal(quotas.available("codex"), false);
  assert.equal(quotas.available("claude"), false);
  remaining = 100;
  await quotas.refresh();
  assert.equal(quotas.available("codex"), false);
});
test("live quota drop aborts every active role of that provider, leaving the other usable", async () => {
  let codexRemaining = 50;
  const quotas = new Quotas(
    { ...config, pollIntervalMs: 10 },
    async (provider) => usage(provider === "codex" ? codexRemaining : 50),
  );
  let entered = 0;
  const action = (signal: AbortSignal) =>
    new Promise((resolve, reject) => {
      entered++;
      signal.addEventListener("abort", () => reject(signal.reason), {
        once: true,
      });
      if (entered === 2) codexRemaining = 4;
    });
  const results = await Promise.allSettled([
    quotas.run("codex", config.models.codex.implementation, action),
    quotas.run("codex", config.models.codex.review, action),
  ]);
  assert.equal(
    results.every((result) => result.status === "rejected"),
    true,
  );
  assert.equal(quotas.available("claude"), true);
});
test("unknown quota fails closed", async () => {
  const quotas = new Quotas(config, async (provider) => {
    if (provider === "claude") throw new Error("network");
    return usage(50);
  });
  await quotas.refresh();
  assert.equal(quotas.available("codex"), true);
  assert.equal(quotas.available("claude"), false);
});
test("review approval requires exactly one valid verdict without findings", () => {
  assert.equal(reviewReport(report()).verdict, "approved");
  assert.throws(() => reviewReport("looks good"));
  assert.throws(() => reviewReport(report() + report()));
  assert.throws(() =>
    reviewReport(
      '<sandcastle-review>{"verdict":"approved","findings":["broken"]}</sandcastle-review>',
    ),
  );
});

function fixture(
  overrides: Partial<Config> = {},
  root = fileURLToPath(new URL("../../", import.meta.url)),
) {
  const events: string[][] = [],
    state = { repository: config.repository, jobs: {} as Record<number, Job> };
  const quotas = {
    available: (_name: Provider) => true,
    refresh: async () => {},
  };
  const runner = new Runner({
    root,
    config: { ...config, ...overrides },
    quotas: fake(quotas),
    state,
    save: () => {},
    git: async (_file, args = []) => {
      events.push(["git", ...args]);
      if (args[0] === "rev-parse")
        return args[1] === "origin/main" ? "base" : "reviewed";
      return "";
    },
    gh: async (_file, args = []) => {
      events.push(["gh", ...args]);
      if (args[0] === "api") return "[[]]";
      if (args[0] === "pr" && args[1] === "list") return "[]";
      return "https://github.com/example/repo/pull/1";
    },
  });
  runner.stage = async (_job, provider, role) => {
    events.push(["stage", provider, role]);
    return {
      sha: "reviewed",
      stdout: role === "review" ? report() : "Implementation done",
      verification: "",
    };
  };
  return { runner, events, state, quotas };
}
test("stage prompts explicitly load each role's skills for the selected provider", async () => {
  const paths = indexSkills();
  const skillPath = (name: string) => join(paths.get(name)!, "SKILL.md");
  const noHuman =
    "No human is available during this stage. Where a skill says to ask the user or wait for an answer, pick the recommended option yourself and list each such choice in your summary.";
  for (const initial of providers) {
    const { runner } = fixture({
      openPr: false,
      skills: {
        implementation: ["tdd", "ponytail"],
        review: ["code-review", "ponytail-review"],
      },
    });
    const prompts: string[] = [];
    runner.stage = async (_job, _provider, role, prompt) => {
      prompts.push(prompt);
      return {
        sha: "reviewed",
        stdout: role === "review" ? report() : "done",
        verification: "",
      };
    };
    await runner.work(issue(1), initial, "main");
    const load = (provider: Provider, names: string[]) =>
      provider === "codex"
        ? `Load these skills: ${names.map((name) => `[$${name}](${skillPath(name)})`).join(" ")}`
        : `Before doing anything else, read and follow these skill files: ${names.map(skillPath).join(", ")}`;
    assert.ok(prompts[0].includes(load(initial, ["tdd", "ponytail"])));
    assert.ok(
      prompts[1].includes(
        load(initial === "codex" ? "claude" : "codex", [
          "code-review",
          "ponytail-review",
        ]),
      ),
    );
    assert.ok(prompts.every((prompt) => prompt.includes(noHuman)));
    assert.ok(!prompts[0].includes("For code-review:"));
    assert.ok(
      prompts[1].includes(
        "For code-review: the fixed point is `base`; the spec is the issue text in this prompt. Do not look up an issue tracker.",
      ),
    );
  }
  const { runner } = fixture({
    openPr: false,
    skills: { implementation: [], review: ["tdd"] },
  });
  const prompts: string[] = [];
  runner.stage = async (_job, _provider, role, prompt) => {
    prompts.push(prompt);
    return {
      sha: "reviewed",
      stdout: role === "review" ? report() : "done",
      verification: "",
    };
  };
  await runner.work(issue(1), "codex", "main");
  assert.ok(
    !prompts[0].includes("Load these skills:") &&
      !prompts[0].includes(
        "Before doing anything else, read and follow these skill files:",
      ),
  );
  assert.ok(!prompts[1].includes("For code-review:"));
});
test("implementation -> opposite-provider review -> push exact SHA -> PR, never issue close or merge", async () => {
  const { runner, events, state } = fixture();
  await runner.work(issue(1), "codex", "main");
  assert.deepEqual(
    events.filter((event) => event[0] === "stage"),
    [
      ["stage", "codex", "implementation"],
      ["stage", "claude", "review"],
    ],
  );
  assert.ok(
    events.some(
      (event) =>
        event[1] === "push" &&
        event[3] === "reviewed:refs/heads/toddler/issue-1",
    ),
  );
  assert.ok(
    events.some(
      (event) =>
        event[0] === "gh" &&
        event[1] === "pr" &&
        event[2] === "create" &&
        event.includes("--body-file"),
    ),
  );
  assert.equal(state.jobs[1].status, "pr");
  assert.ok(
    !events.some((event) => event.includes("merge") || event.includes("close")),
  );
});
test("local issue files parse frontmatter, and fall back to the file name", () => {
  const parsed = localIssue(
    "1-auth/issues/3-fix-login.md",
    "---\ntitle: Fix login\nlabels: [parallel-safe, blocked]\nblocked_by: [1, 2]\nstatus: closed\n---\nSteps here\n",
  );
  assert.deepEqual(parsed, {
    number: 3,
    title: "Fix login",
    body: "Steps here\n",
    labels: ["parallel-safe", "blocked"],
    blockedBy: [1, 2],
    closed: true,
  });
  assert.deepEqual(localIssue("1-auth/issues/4-add-logout.md", "Body only"), {
    number: 4,
    title: "add logout",
    body: "Body only",
    labels: [],
    blockedBy: [],
    closed: false,
  });
  assert.throws(() => localIssue("1-auth/issues/notes.md", ""), /issue-number/);
  assert.throws(() => localIssue("3-fix-login.md", ""), /spec-number/);
  assert.throws(() => localIssue("1-auth/3-fix-login.md", ""), /issues\//);
  assert.throws(
    () => localIssue("1-auth/issues/5.md", "---\nblocked_by: [x]\n---\n"),
    /blocked_by/,
  );
});
test("local issues skip closed and blocked files, never call GitHub, and stop on a local branch when openPr is false", async () => {
  const root = mkdtempSync(join(tmpdir(), "toddler-local-"));
  try {
    mkdirSync(join(root, ".sandcastle/specs/1-a/issues"), { recursive: true });
    mkdirSync(join(root, ".sandcastle/specs/2-b/issues"), { recursive: true });
    const write = (name: string, text: string) =>
      writeFileSync(join(root, ".sandcastle/specs", name), text);
    write("1-a/spec.md", "The spec, not an issue");
    write("1-a/issues/1-done.md", "---\nstatus: closed\n---\n");
    write("2-b/issues/2-open.md", "---\nblocked_by: [1]\n---\nDo it");
    write("1-a/issues/3-waits.md", "---\nblocked_by: [2]\n---\n");
    const { runner, events, state } = fixture(
      { issues: "local", openPr: false },
      root,
    );
    const candidates = await runner.candidates();
    assert.deepEqual(
      candidates.map((issue) => issue.number),
      [2],
    );
    await runner.work(candidates[0], "codex", "main");
    assert.equal(state.jobs[2].status, "done");
    assert.equal(state.jobs[2].branch, "toddler/local-2");
    assert.ok(
      events.some((event) => event[1] === "rev-parse" && event[2] === "main"),
      "offline jobs start from the local branch",
    );
    assert.ok(
      !events.some((event) => event.some((arg) => arg.startsWith("origin"))),
    );
    assert.ok(
      !events.some((event) => event[0] === "gh" || event[1] === "push"),
    );
    assert.deepEqual(
      (await runner.candidates()).map((issue) => issue.number),
      [],
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
test("local issues with openPr open a PR that does not close a GitHub issue", async () => {
  const { runner, events, state } = fixture({ issues: "local" });
  await runner.work(issue(7), "codex", "main");
  assert.equal(state.jobs[7].status, "pr");
  const create = events.find(
    (event) => event[1] === "pr" && event[2] === "create",
  )!;
  assert.ok(create.includes("Fix local issue 7: Issue 7"));
  assert.ok(
    events.some(
      (event) =>
        event[1] === "push" &&
        event[3] === "reviewed:refs/heads/toddler/local-7",
    ),
  );
});
test("changes requested runs a fix then another review before publishing", async () => {
  const { runner, events } = fixture();
  let reviews = 0;
  runner.stage = async (_job, provider, role) => {
    events.push(["stage", provider, role]);
    return {
      sha: "reviewed",
      stdout:
        role === "review"
          ? report(++reviews === 1 ? "changes_requested" : "approved")
          : "done",
      verification: "",
    };
  };
  await runner.work(issue(1), "codex", "main");
  assert.equal(events.filter((event) => event[0] === "stage").length, 4);
  assert.equal(
    events.findIndex((event) => event[1] === "push") >
      events.findLastIndex((event) => event[0] === "stage"),
    true,
  );
});
test("quota interruption transfers unfinished implementation and uses remaining provider's reviewer role", async () => {
  const { runner, events, quotas, state } = fixture();
  let codexEnabled = true;
  quotas.available = (name: Provider) => name !== "codex" || codexEnabled;
  runner.stage = async (_job, provider, role) => {
    events.push(["stage", provider, role]);
    if (provider === "codex") {
      codexEnabled = false;
      throw new Error("quota abort");
    }
    return {
      sha: "reviewed",
      stdout: role === "review" ? report() : "done",
      verification: "",
    };
  };
  await runner.work(issue(1), "codex", "main");
  assert.deepEqual(
    events.filter((event) => event[0] === "stage"),
    [
      ["stage", "codex", "implementation"],
      ["stage", "claude", "implementation"],
      ["stage", "claude", "review"],
    ],
  );
  assert.equal(state.jobs[1].status, "pr");
  assert.equal(state.jobs[1].branch, "toddler/issue-1");
});
test("review selection uses the review model while implementation remains available", async () => {
  const { runner, events, quotas } = fixture();
  quotas.available = ((name: Provider, model: string) =>
    !(
      name === "claude" && model === config.models.claude.review
    )) as typeof quotas.available;
  await runner.work(issue(1), "codex", "main");
  assert.deepEqual(
    events.filter((event) => event[0] === "stage"),
    [
      ["stage", "codex", "implementation"],
      ["stage", "codex", "review"],
    ],
  );
});
test("malformed review and changed reviewed SHA cannot push or open a PR", async () => {
  for (const changedSha of [false, true]) {
    const { runner, events, state } = fixture();
    runner.stage = async (_job, _provider, role) => ({
      sha: "different",
      stdout: role === "review" && changedSha ? report() : "missing verdict",
      verification: "",
    });
    await runner.work(issue(1), "codex", "main");
    assert.ok(state.jobs[1].lastError);
    assert.ok(
      !events.some(
        (event) =>
          event[1] === "push" || (event[1] === "pr" && event[2] === "create"),
      ),
    );
  }
});
test("no available issue or quota terminates without starting agents", async () => {
  const { runner, events, quotas } = fixture();
  runner.candidates = async () => [];
  await runner.run("main");
  quotas.available = () => false;
  runner.candidates = async () => [issue(1)];
  await runner.run("main");
  assert.equal(events.length, 0);
});
test("run ends when every configured model is stopped by scoped weekly readings", async () => {
  const { runner, events } = fixture();
  const scopedConfig = {
    ...config,
    models: {
      codex: { implementation: "codex-a", review: "codex-b" },
      claude: { implementation: "claude-fable", review: "claude-fable" },
    },
  };
  runner.config = scopedConfig;
  runner.quotas = new Quotas(scopedConfig, async (provider) => ({
    ...usage(50),
    weeklyByModel: Object.fromEntries(
      (provider === "codex" ? ["codex-a", "codex-b"] : ["Fable"]).map(
        (model) => [model, { remainingPercent: 10, resetsAt: null }],
      ),
    ),
  }));
  runner.candidates = async () => [issue(1)];
  await runner.run("main");
  assert.equal(events.length, 0);
});

test("Sandcastle stage uses the requested model, runs the verify command in Seatbelt, and always closes", async () => {
  for (const provider of providers) {
    let closed = false,
      captured: any;
    const commands: { cmd: string; options: any }[] = [];
    const root = fileURLToPath(new URL("../../", import.meta.url));
    const sandbox = {
      worktreePath: "/fixture",
      close: async () => {
        closed = true;
        return {};
      },
      exec: async (cmd: string, options: unknown) => {
        commands.push({ cmd, options });
        return { exitCode: 0, stdout: "Checks passed" };
      },
      run: async (options: unknown) => {
        captured = options;
        return { stdout: report() };
      },
    };
    const factories: Record<string, unknown> = {};
    for (const name of ["codex", "claudeCode"])
      factories[name] = (model: string, options: object) => ({
        model,
        ...options,
        buildPrintCommand: () => ({ command: "native-cli", stdin: "task" }),
      });
    const runner = new Runner({
      root,
      config,
      quotas: fake({
        run: async (
          _provider: Provider,
          _model: string,
          action: (signal: AbortSignal) => unknown,
        ) => action(new AbortController().signal),
      }),
      state: { repository: config.repository, jobs: {} },
      save: () => {},
      sandcastle: fake({ ...factories, createSandbox: async () => sandbox }),
      authentication: {
        codex: async () => "fake-private-auth",
        claude: async () => "fake-oauth",
      },
      git: async (_file, args = []) =>
        args[0] === "branch"
          ? "codex/fixture"
          : args[0] === "rev-parse"
            ? "reviewed"
            : "",
    });
    const result = await runner.stage(
      fake<Job>({ number: 1, branch: "codex/fixture", baseSha: "base" }),
      provider,
      "review",
      "task",
    );
    assert.equal(captured.agent.model, config.models[provider].review);
    assert.equal(captured.agent.captureSessions, false);
    assert.equal(captured.logging.type, "file");
    assert.match(
      captured.agent.buildPrintCommand({}).command,
      /^unset CODEX_HOME /,
    );
    if (provider === "claude")
      assert.ok(
        captured.agent
          .buildPrintCommand({})
          .command.includes('CLAUDE_CODE_TMPDIR="$TMPDIR"'),
      );
    assert.ok(
      commands.some(({ cmd, options }) => cmd === "make check" && !options),
    );
    const setup = commands.find(({ cmd }) =>
      cmd.includes('"$HOME/.claude/skills"'),
    )!;
    assert.ok(setup.cmd.includes('"$HOME/.agents/skills"'));
    for (const name of config.skills.review)
      assert.ok(setup.cmd.includes(`'${name}'`));
    for (const name of config.skills.implementation.filter(
      (name) => !config.skills.review.includes(name),
    )) {
      assert.ok(!setup.cmd.includes(`'${name}'`));
    }
    if (provider === "codex")
      assert.equal(commands[0].options.stdin, "fake-private-auth");
    assert.equal(result.verification, "Checks passed");
    assert.equal(closed, true);
    runner.config = { ...config, install: "npm ci" };
    commands.length = 0;
    await runner.stage(
      fake<Job>({ number: 1, branch: "codex/fixture", baseSha: "base" }),
      provider,
      "review",
      "task",
    );
    assert.equal(
      commands.filter(({ options }) => !options)[0].cmd,
      "npm ci",
      "install runs before verify",
    );
    sandbox.exec = async (cmd: string, options: unknown) => ({
      exitCode: cmd === "npm ci" ? 1 : 0,
      stdout: "",
    });
    closed = false;
    await assert.rejects(
      runner.stage(
        fake<Job>({ number: 1, branch: "codex/fixture", baseSha: "base" }),
        provider,
        "review",
        "task",
      ),
      /Sandbox install failed: npm ci/,
    );
    assert.equal(closed, true);
    sandbox.exec = async (cmd: string, options: unknown) => {
      commands.push({ cmd, options });
      return { exitCode: 0, stdout: "Checks passed" };
    };
    runner.config = { ...config, verify: "" };
    commands.length = 0;
    closed = false;
    const unverified = await runner.stage(
      fake<Job>({ number: 1, branch: "codex/fixture", baseSha: "base" }),
      provider,
      "review",
      "task",
    );
    assert.ok(
      !commands.some(({ options }) => !options),
      "no verify command runs when verify is empty",
    );
    assert.equal(unverified.verification, "");
    assert.equal(closed, true);
  }
});

test("reviewer commit mutation is rejected and sandbox is closed", async () => {
  let closed = false,
    reads = 0;
  const runner = new Runner(
    fake<RunnerOptions>({
      root: "/fixture",
      config,
      quotas: {
        run: async (
          _provider: Provider,
          _model: string,
          action: (signal: AbortSignal) => unknown,
        ) => action(new AbortController().signal),
      },
      state: { jobs: {} },
      save: () => {},
      authentication: { claude: async () => "fake" },
      sandcastle: {
        claudeCode: () => ({
          buildPrintCommand: () => ({ command: "native-cli" }),
        }),
        createSandbox: async () => ({
          worktreePath: "/fixture",
          run: async () => ({ stdout: report() }),
          exec: async () => ({ exitCode: 0, stdout: "" }),
          close: async () => {
            closed = true;
            return {};
          },
        }),
      },
      git: async (_file: string, args: string[]) =>
        args[0] === "branch"
          ? "codex/fixture"
          : args[0] === "rev-parse"
            ? ++reads === 1
              ? "before"
              : "after"
            : "",
    }),
  );
  await assert.rejects(
    runner.stage(
      fake<Job>({ number: 1, branch: "codex/fixture" }),
      "claude",
      "review",
      "task",
    ),
    /Reviewer modified commits/,
  );
  assert.equal(closed, true);
});

test("same provider/role sessions queue while distinct roles can proceed", async () => {
  const { runner } = fixture();
  delete (runner as { stage?: unknown }).stage;
  let active = 0,
    maximum = 0,
    startReview!: () => void;
  const reviewStarted = new Promise<void>((resolve) => {
    startReview = resolve;
  });
  let finishFirst!: () => void;
  const firstDone = new Promise<void>((resolve) => {
    finishFirst = resolve;
  });
  const done = fake<Awaited<ReturnType<Runner["runStage"]>>>(undefined);
  runner.runStage = async (job, _provider, role) => {
    if (role === "review") {
      startReview();
      return done;
    }
    maximum = Math.max(maximum, ++active);
    if (job.number === 1) await firstDone;
    active--;
    return done;
  };
  const first = runner.stage(
    fake<Job>({ number: 1 }),
    "codex",
    "implementation",
    "task",
  );
  const second = runner.stage(
    fake<Job>({ number: 2 }),
    "codex",
    "implementation",
    "task",
  );
  const review = runner.stage(
    fake<Job>({ number: 3 }),
    "codex",
    "review",
    "task",
  );
  await reviewStarted;
  assert.equal(active, 1);
  finishFirst();
  await Promise.all([first, second, review]);
  assert.equal(maximum, 1);
});

test("project config overrides defaults, must name a repository, and verify is optional", () => {
  const root = mkdtempSync(join(tmpdir(), "toddler-config-"));
  try {
    assert.throws(() => loadConfig(root), /toddler init/);
    mkdirSync(join(root, ".sandcastle"));
    const write = (value: object) =>
      writeFileSync(
        join(root, ".sandcastle/config.json"),
        JSON.stringify(value),
      );
    write({ repository: "owner/repo" });
    assert.equal(loadConfig(root).verify, "");
    assert.equal(loadConfig(root).install, "");
    write({ repository: "owner/repo", install: ["npm ci"] });
    assert.throws(() => loadConfig(root), /"install"/);
    write({ repository: "owner/repo", verify: 5 });
    assert.throws(() => loadConfig(root), /"verify"/);
    write({ repository: "not a repo", verify: "npm test" });
    assert.throws(() => loadConfig(root), /"repository"/);
    write({
      repository: "owner/repo",
      verify: "npm test",
      stopAt: { codex: { weekly: 20 } },
      models: { claude: { implementation: "a", review: "b" } },
    });
    const loaded = loadConfig(root);
    assert.deepEqual(loaded.stopAt.codex, { fiveHour: 5, weekly: 20 });
    assert.deepEqual(loaded.stopAt.claude, { fiveHour: 5, weekly: 10 });
    for (const stopAt of [
      { other: { weekly: 10 } },
      { codex: { weekly: -1 } },
      { claude: { fiveHour: 101 } },
      { claude: { weekly: "10" } },
      { codex: { unknown: 1 } },
    ]) {
      write({ repository: "owner/repo", stopAt });
      assert.throws(() => loadConfig(root), /stopAt/);
    }
    assert.equal(loaded.models.claude.review, "b");
    assert.equal(loaded.models.codex, defaults.models.codex);
    assert.equal(loaded.issueLabel, defaults.issueLabel);
    assert.equal(loaded.issues, "github");
    assert.equal(loaded.openPr, true);
    write({ verify: "npm test", issues: "local", openPr: false });
    assert.equal(loadConfig(root).repository, "local");
    write({ verify: "npm test", issues: "local" });
    assert.throws(() => loadConfig(root), /"repository"/);
    write({ repository: "owner/repo", verify: "npm test", issues: "jira" });
    assert.throws(() => loadConfig(root), /"issues"/);
    write({ repository: "owner/repo", verify: "npm test", openPr: "no" });
    assert.throws(() => loadConfig(root), /"openPr"/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
