import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { assignments, reviewer, reviewReport } from "../policy.ts";
import { Quotas, codexUsage, claudeUsage, validateUsage, type Usage } from "../quota.ts";
import { Runner, type Job, type RunnerOptions } from "../runner.ts";
import config, { providers, type Provider } from "../config.ts";

// Test doubles implement only what each test exercises.
const fake = <T,>(value: unknown) => value as T;

const now = Date.now();
const usage = (remainingPercent: number): Usage => ({ remainingPercent, resetsAt: Math.floor(Date.now() / 1000) + 1000, observedAt: Date.now() });
const issue = (number: number, labels: string[] = []) => ({ number, labels, title: `Issue ${number}`, body: "Fix the behavior" });
const report = (verdict = "approved") => `<sandcastle-review>${JSON.stringify({ verdict,
  findings: verdict === "approved" ? [] : ["Fix incorrect mapping"], summary: "Corrected the mapping", validation: "Lua syntax passed" })}</sandcastle-review>`;

test("one issue prefers Codex; fallback and explicit independent parallel issues", () => {
  assert.equal(assignments([issue(1)], () => true, config)[0].provider, "codex");
  assert.equal(assignments([issue(1)], (name) => name === "claude", config)[0].provider, "claude");
  assert.equal(assignments([issue(1), issue(2)], () => true, config).length, 1);
  assert.deepEqual(assignments([issue(1, ["parallel-safe"]), issue(2, ["parallel-safe"])], () => true, config)
    .map(({ issue, provider }) => [issue.number, provider]), [[1, "codex"], [2, "claude"]]);
  assert.equal(assignments([issue(1, ["blocked"]), issue(2)], () => true, config)[0].issue.number, 2);
  assert.equal(assignments([issue(1)], () => false, config).length, 0);
});
test("opposite-provider review, same-provider fallback, no reviewer when exhausted", () => {
  assert.equal(reviewer("codex", () => true), "claude");
  assert.equal(reviewer("claude", () => true), "codex");
  assert.equal(reviewer("claude", (name) => name === "claude"), "claude");
  assert.equal(reviewer("claude", () => false), undefined);
});
test("quota windows must be five hours, fresh, numeric and from the configured bucket", () => {
  const bucket = { limitId: "codex", primary: { windowDurationMins: 300, usedPercent: 94, resetsAt: now / 1000 + 1000 } };
  assert.equal(codexUsage({ rateLimits: bucket }, "codex", now).remainingPercent, 6);
  assert.throws(() => codexUsage({ rateLimits: bucket }, "unrelated", now));
  assert.throws(() => codexUsage({ rateLimits: { ...bucket, primary: { ...bucket.primary, windowDurationMins: 60 } } }, "codex", now));
  assert.throws(() => validateUsage({ ...usage(50), observedAt: now - 61_000 }, now));
  assert.throws(() => validateUsage({ ...usage(50), resetsAt: now / 1000 - 1 }, now));
  assert.throws(() => validateUsage({ ...usage(50), remainingPercent: fake<number>("50") }, now));
  assert.equal(claudeUsage({ five_hour: { utilization: 94, resets_at: new Date(now + 100000).toISOString() } }, now).remainingPercent, 6);
  assert.equal(codexUsage({ rateLimits: { ...bucket, secondary: { usedPercent: 100, resetsAt: now / 1000 + 2000 } } }, "codex", now).remainingPercent, 0);
});
test("at 5% reserve both roles stop; no automatic reset/restart within a run", async () => {
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
  const quotas = new Quotas({ ...config, pollIntervalMs: 10 }, async (provider) => usage(provider === "codex" ? codexRemaining : 50));
  let entered = 0;
  const action = (signal: AbortSignal) => new Promise((resolve, reject) => {
    entered++;
    signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    if (entered === 2) codexRemaining = 4;
  });
  const results = await Promise.allSettled([quotas.run("codex", action), quotas.run("codex", action)]);
  assert.equal(results.every((result) => result.status === "rejected"), true);
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
  assert.throws(() => reviewReport('<sandcastle-review>{"verdict":"approved","findings":["broken"]}</sandcastle-review>'));
});

function fixture() {
  const events: string[][] = [], state = { repository: config.repository, jobs: {} as Record<number, Job> };
  const quotas = { available: (_name: Provider) => true, refresh: async () => {} };
  const runner = new Runner({ root: fileURLToPath(new URL("../../", import.meta.url)), config, quotas: fake(quotas),
    state, save: () => {}, git: async (_file, args = []) => {
      events.push(["git", ...args]);
      if (args[0] === "rev-parse") return args[1] === "origin/main" ? "base" : "reviewed";
      return "";
    }, gh: async (_file, args = []) => {
      events.push(["gh", ...args]);
      if (args[0] === "api") return "[[]]";
      if (args[0] === "pr" && args[1] === "list") return "[]";
      return "https://github.com/example/repo/pull/1";
    } });
  runner.stage = async (_job, provider, role) => {
    events.push(["stage", provider, role]);
    return { sha: "reviewed", stdout: role === "review" ? report() : "Implementation done", verification: "" };
  };
  return { runner, events, state, quotas };
}
test("implementation -> opposite-provider review -> push exact SHA -> PR, never issue close or merge", async () => {
  const { runner, events, state } = fixture();
  await runner.work(issue(1), "codex", "main");
  assert.deepEqual(events.filter((event) => event[0] === "stage"),
    [["stage", "codex", "implementation"], ["stage", "claude", "review"]]);
  assert.ok(events.some((event) => event[1] === "push" && event[3] === "reviewed:refs/heads/codex/sandcastle-issue-1"));
  assert.ok(events.some((event) => event[0] === "gh" && event[1] === "pr" && event[2] === "create" && event.includes("--body-file")));
  assert.equal(state.jobs[1].status, "pr");
  assert.ok(!events.some((event) => event.includes("merge") || event.includes("close")));
});
test("changes requested runs a fix then another review before publishing", async () => {
  const { runner, events } = fixture();
  let reviews = 0;
  runner.stage = async (_job, provider, role) => {
    events.push(["stage", provider, role]);
    return { sha: "reviewed", stdout: role === "review" ? report(++reviews === 1 ? "changes_requested" : "approved") : "done", verification: "" };
  };
  await runner.work(issue(1), "codex", "main");
  assert.equal(events.filter((event) => event[0] === "stage").length, 4);
  assert.equal(events.findIndex((event) => event[1] === "push") > events.findLastIndex((event) => event[0] === "stage"), true);
});
test("quota interruption transfers unfinished implementation and uses remaining provider's reviewer role", async () => {
  const { runner, events, quotas, state } = fixture();
  let codexEnabled = true;
  quotas.available = (name: Provider) => name !== "codex" || codexEnabled;
  runner.stage = async (_job, provider, role) => {
    events.push(["stage", provider, role]);
    if (provider === "codex") { codexEnabled = false; throw new Error("quota abort"); }
    return { sha: "reviewed", stdout: role === "review" ? report() : "done", verification: "" };
  };
  await runner.work(issue(1), "codex", "main");
  assert.deepEqual(events.filter((event) => event[0] === "stage"), [
    ["stage", "codex", "implementation"], ["stage", "claude", "implementation"], ["stage", "claude", "review"],
  ]);
  assert.equal(state.jobs[1].status, "pr");
});
test("malformed review and changed reviewed SHA cannot push or open a PR", async () => {
  for (const changedSha of [false, true]) {
    const { runner, events, state } = fixture();
    runner.stage = async (_job, _provider, role) => ({ sha: "different", stdout: role === "review" && changedSha ? report() : "missing verdict", verification: "" });
    await runner.work(issue(1), "codex", "main");
    assert.ok(state.jobs[1].lastError);
    assert.ok(!events.some((event) => event[1] === "push" || (event[1] === "pr" && event[2] === "create")));
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

test("Sandcastle stage uses the requested model, verifies Lua in Seatbelt, and always closes", async () => {
  for (const provider of providers) {
    let closed = false, captured: any;
    const commands: { cmd: string; options: any }[] = [];
    const root = fileURLToPath(new URL("../../", import.meta.url));
    const sandbox = { worktreePath: "/fixture", close: async () => { closed = true; return {}; },
      exec: async (cmd: string, options: unknown) => { commands.push({ cmd, options }); return { exitCode: 0, stdout: "Lua syntax passed" }; },
      run: async (options: unknown) => { captured = options; return { stdout: report() }; } };
    const factories: Record<string, unknown> = {};
    for (const name of ["codex", "claudeCode"]) factories[name] = (model: string, options: object) => ({ model, ...options,
      buildPrintCommand: () => ({ command: "native-cli", stdin: "task" }) });
    const runner = new Runner({ root, config, quotas: fake({ run: async (_provider: Provider, action: (signal: AbortSignal) => unknown) => action(new AbortController().signal) }),
      state: { repository: config.repository, jobs: {} }, save: () => {}, sandcastle: fake({ ...factories, createSandbox: async () => sandbox }),
      authentication: { codex: async () => "fake-private-auth", claude: async () => "fake-oauth" },
      git: async (_file, args = []) => args[0] === "branch" ? "codex/fixture" : args[0] === "rev-parse" ? "reviewed" : "" });
    const result = await runner.stage(fake<Job>({ number: 1, branch: "codex/fixture", baseSha: "base" }), provider, "review", "task");
    assert.equal(captured.agent.model, config.models[provider].review);
    assert.equal(captured.agent.captureSessions, false);
    assert.equal(captured.logging.type, "file");
    assert.match(captured.agent.buildPrintCommand({}).command, /^unset CODEX_HOME /);
    if (provider === "claude") assert.ok(captured.agent.buildPrintCommand({}).command.includes('CLAUDE_CODE_TMPDIR="$TMPDIR"'));
    assert.ok(commands.some(({ cmd, options }) => cmd === "node --input-type=module-typescript" && options.stdin.includes("luac")));
    if (provider === "codex") assert.equal(commands[0].options.stdin, "fake-private-auth");
    assert.equal(result.verification, "Lua syntax passed");
    assert.equal(closed, true);
  }
});

test("reviewer commit mutation is rejected and sandbox is closed", async () => {
  let closed = false, reads = 0;
  const runner = new Runner(fake<RunnerOptions>({ root: "/fixture", config,
    quotas: { run: async (_provider: Provider, action: (signal: AbortSignal) => unknown) => action(new AbortController().signal) },
    state: { jobs: {} }, save: () => {}, authentication: { claude: async () => "fake" },
    sandcastle: {
      claudeCode: () => ({ buildPrintCommand: () => ({ command: "native-cli" }) }),
      createSandbox: async () => ({ worktreePath: "/fixture", run: async () => ({ stdout: report() }),
        close: async () => { closed = true; return {}; } }),
    }, git: async (_file: string, args: string[]) => args[0] === "branch" ? "codex/fixture" :
      args[0] === "rev-parse" ? (++reads === 1 ? "before" : "after") : "" }));
  await assert.rejects(runner.stage(fake<Job>({ number: 1, branch: "codex/fixture" }), "claude", "review", "task"), /Reviewer modified commits/);
  assert.equal(closed, true);
});

test("same provider/role sessions queue while distinct roles can proceed", async () => {
  const { runner } = fixture();
  delete (runner as { stage?: unknown }).stage;
  let active = 0, maximum = 0, startReview!: () => void;
  const reviewStarted = new Promise<void>((resolve) => { startReview = resolve; });
  let finishFirst!: () => void;
  const firstDone = new Promise<void>((resolve) => { finishFirst = resolve; });
  const done = fake<Awaited<ReturnType<Runner["runStage"]>>>(undefined);
  runner.runStage = async (job, _provider, role) => {
    if (role === "review") { startReview(); return done; }
    maximum = Math.max(maximum, ++active);
    if (job.number === 1) await firstDone;
    active--;
    return done;
  };
  const first = runner.stage(fake<Job>({ number: 1 }), "codex", "implementation", "task");
  const second = runner.stage(fake<Job>({ number: 2 }), "codex", "implementation", "task");
  const review = runner.stage(fake<Job>({ number: 3 }), "codex", "review", "task");
  await reviewStarted;
  assert.equal(active, 1);
  finishFirst();
  await Promise.all([first, second, review]);
  assert.equal(maximum, 1);
});
