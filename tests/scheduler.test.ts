import test from "node:test";
import assert from "node:assert/strict";
import { defaults, type Provider } from "../src/config.ts";
import {
  Quotas,
  StopConditionError,
  type ReadUsage,
  type Reading,
} from "../src/quota.ts";
import type { Ranker } from "../src/policy.ts";
import { Scheduler, type Clock } from "../src/scheduler.ts";

const reading = ({
  fiveHour = 50,
  weekly = 50,
  resetsAt = Math.floor(Date.now() / 1000) + 1000,
  models = {},
  allowed = null,
}: {
  allowed?: boolean | null;
  fiveHour?: number;
  weekly?: number;
  resetsAt?: number;
  models?: Record<string, number>;
} = {}): Reading => ({
  observedAt: Date.now(),
  allowed,
  fiveHour: { remainingPercent: fiveHour, resetsAt },
  weekly: { remainingPercent: weekly, resetsAt },
  weeklyByModel: Object.fromEntries(
    Object.entries(models).map(([model, remainingPercent]) => [
      model,
      { remainingPercent, resetsAt },
    ]),
  ),
});
// Each provider reads its queue in order (an Error is thrown); the last entry repeats.
const scripted =
  (queues: Partial<Record<Provider, (Reading | Error)[]>>): ReadUsage =>
  async (provider) => {
    const queue = queues[provider] ?? [reading()];
    const next = queue.length > 1 ? queue.shift()! : queue[0];
    if (next instanceof Error) throw next;
    return next;
  };
// wait moves now and resolves at once.
const testClock = (): Clock & { waits: number[] } => {
  let now = 1_000_000;
  const waits: number[] = [];
  return {
    waits,
    now: () => now,
    wait: async (ms) => {
      waits.push(ms);
      now += ms;
    },
  };
};
const issue = (number: number, labels: string[] = []) => ({
  number,
  labels,
  title: `Issue ${number}`,
});
const safe = (number: number) => issue(number, ["parallel-safe"]);

// Least busy first, so a second fresh issue lands on the idle provider.
const ranker: Ranker = ({ candidates }) =>
  [...candidates].sort((a, b) => a.running - b.running).map((c) => c.provider);

async function scheduler(
  overrides: Partial<typeof defaults> = {},
  queues: Parameters<typeof scripted>[0] = {},
) {
  const config = { ...defaults, ...overrides };
  const quotas = new Quotas(config, scripted(queues));
  await quotas.refresh();
  return { quotas, scheduler: new Scheduler({ config, quotas, ranker }) };
}

test("two picks in one pass see each other's running; release() decrements", async () => {
  const { scheduler: s } = await scheduler();
  const first = s.pick("implementation", issue(1))!;
  assert.equal(first.provider, "codex");
  assert.equal(s.running("codex"), 1);
  const second = s.pick("implementation", issue(2))!;
  assert.equal(second.provider, "claude");
  // Reservations count across roles.
  const review = s.pick("review", issue(1), { implementer: "claude" })!;
  assert.equal(review.provider, "codex");
  assert.equal(s.running("codex"), 2);
  first.release();
  first.release();
  assert.equal(s.running("codex"), 1);
  second.release();
  review.release();
  assert.equal(s.running("claude") + s.running("codex"), 0);
  assert.equal(s.pick("implementation", issue(3))!.provider, "codex");
});

test("picks follow quota: single provider, fallback, none, and review pairing", async () => {
  const only = await scheduler({ providers: ["claude"] });
  assert.equal(
    only.scheduler.pick("implementation", issue(1))!.provider,
    "claude",
  );
  const none = await scheduler(
    {},
    { codex: [new Error("down")], claude: [new Error("down")] },
  );
  assert.equal(none.scheduler.pick("implementation", issue(1)), undefined);
  assert.equal(
    none.scheduler.pick("review", issue(1), { implementer: "codex" }),
    undefined,
  );
  const { scheduler: s, quotas } = await scheduler();
  const job = { implementer: "codex" as Provider };
  // Review is the ranker's pick, so the implementer may review its own work.
  assert.equal(s.pick("review", issue(1), job)!.provider, "codex");
  // A sticky implementer stays while it is usable, and the ranker takes over once stopped.
  assert.equal(s.pick("implementation", issue(1), job)!.provider, "codex");
  quotas.disable("codex", "test");
  assert.equal(s.pick("implementation", issue(1), job)!.provider, "claude");
  quotas.disable("claude", "test");
  assert.equal(s.pick("implementation", issue(1), job), undefined);
});

test("admit enforces maxParallelIssues among parallel-safe issues", async () => {
  const { scheduler: s } = await scheduler();
  assert.equal(s.admit(safe(2), [safe(1)]), true);
  assert.equal(s.admit(safe(3), [safe(1), safe(2)]), false);
  const wide = (await scheduler({ maxParallelIssues: 3 })).scheduler;
  assert.equal(wide.admit(safe(3), [safe(1), safe(2)]), true);
  const one = (await scheduler({ maxParallelIssues: 1 })).scheduler;
  assert.equal(one.admit(safe(2), [safe(1)]), false);
  assert.equal(one.admit(safe(1), []), true);
});

test("an issue without parallel-safe runs alone and blocks other starts", async () => {
  const { scheduler: s } = await scheduler();
  assert.equal(s.admit(issue(1), []), true);
  assert.equal(s.admit(issue(1), [safe(2)]), false);
  assert.equal(s.admit(safe(2), [issue(1)]), false);
  assert.equal(s.admit(issue(2), [issue(1)]), false);
});

test("a quota stop aborts only the matching reservations", async () => {
  const { scheduler: s, quotas } = await scheduler(
    {
      roles: {
        ...defaults.roles,
        review: {
          ...defaults.roles.review,
          models: { ...defaults.roles.review.models, claude: "claude-fable" },
        },
      },
    },
    {},
  );
  const implementation = s.reserve(
    "claude",
    defaults.roles.implementation.models.claude,
  );
  const review = s.reserve("claude", "claude-fable");
  const other = s.reserve("codex", defaults.roles.implementation.models.codex);
  quotas.disableModel("claude", "claude-fable", "model stop");
  assert.equal(review.signal.aborted, true);
  assert.equal(implementation.signal.aborted, false);
  quotas.disable("claude", "provider stop");
  assert.equal(implementation.signal.aborted, true);
  assert.equal(other.signal.aborted, false);
});

test("a threshold reading from the script stops reservations on refresh", async () => {
  const { scheduler: s, quotas } = await scheduler(
    {},
    { codex: [reading({ fiveHour: 50 }), reading({ fiveHour: 3 })] },
  );
  const held = s.pick("implementation", issue(1))!;
  assert.equal(held.provider, "codex");
  await quotas.refresh();
  assert.equal(held.signal.aborted, true);
});

test("the injected clock waits without real time", async () => {
  const clock = testClock();
  const before = clock.now();
  await clock.wait(60_000);
  assert.equal(clock.now(), before + 60_000);
  assert.deepEqual(clock.waits, [60_000]);
  const { scheduler: s } = await scheduler();
  assert.equal(s.wakeAt(), undefined);
});

test("ranker is skipped below two candidates and sees only { candidates } at two or more", async () => {
  const calls: unknown[] = [];
  const ranker = (input: unknown) => {
    calls.push(input);
    return (input as { candidates: { provider: Provider }[] }).candidates
      .map((c) => c.provider)
      .reverse();
  };
  const make = async (overrides: Partial<typeof defaults> = {}) => {
    const config = { ...defaults, ...overrides };
    const quotas = new Quotas(config, scripted({}));
    await quotas.refresh();
    return { quotas, scheduler: new Scheduler({ config, quotas, ranker }) };
  };
  const { quotas, scheduler: s } = await make();
  const held = s.pick("implementation", issue(1))!;
  assert.deepEqual(Object.keys(calls[0] as object), ["candidates"]);
  const seen = (
    calls[0] as { candidates: { provider: string; running: number }[] }
  ).candidates;
  assert.deepEqual(
    seen.map((c) => [c.provider, c.running]),
    [
      ["codex", 0],
      ["claude", 0],
    ],
  );
  assert.equal(held.provider, "claude");
  // One candidate left: that provider, no call.
  quotas.disable("codex", "test");
  calls.length = 0;
  assert.equal(s.pick("implementation", issue(2))!.provider, "claude");
  // No candidate: none, no call.
  quotas.disable("claude", "test");
  assert.equal(s.pick("implementation", issue(3)), undefined);
  assert.equal(calls.length, 0);
  // running counts live reservations in every role.
  const again = await make();
  again.scheduler.reserve("codex", "m");
  again.scheduler.pick("implementation", issue(1));
  const second = calls.at(-1) as { candidates: { running: number }[] };
  assert.equal(second.candidates[0].running, 1); // codex
});

test("a ranker that prefers a busy provider is obeyed for a second fresh issue", async () => {
  const config = { ...defaults };
  const quotas = new Quotas(config, scripted({}));
  await quotas.refresh();
  const s = new Scheduler({
    config,
    quotas,
    ranker: ({ candidates }) => candidates.map((c) => c.provider),
  });
  assert.equal(s.pick("implementation", issue(1))!.provider, "codex");
  assert.equal(s.pick("implementation", issue(2))!.provider, "codex");
  assert.equal(s.running("codex"), 2);
});

test("a stop lifts on a reading above threshold", async () => {
  const { quotas } = await scheduler(
    {},
    { codex: [reading({ fiveHour: 3 }), reading({ fiveHour: 50 })] },
  );
  assert.equal(quotas.available("codex"), false);
  await quotas.refresh();
  assert.equal(quotas.available("codex"), true);
});

test("allowed: false stops Codex only; true and null lift it; a poll finding false aborts Codex signals", async () => {
  const { scheduler: s, quotas } = await scheduler(
    {},
    {
      codex: [
        reading({ allowed: false }),
        reading({ allowed: true }),
        reading({ allowed: false }),
        reading({ allowed: null }),
      ],
      claude: [reading({ allowed: false })],
    },
  );
  assert.equal(quotas.available("codex"), false);
  assert.equal(
    quotas.disabled.get("codex"),
    "provider reports ordinary usage not allowed",
  );
  assert.equal(quotas.available("claude"), true);
  await quotas.refresh();
  assert.equal(quotas.available("codex"), true);
  const codex = s.reserve("codex", "m");
  const claude = s.reserve("claude", "m");
  await quotas.refresh();
  assert.equal(quotas.available("codex"), false);
  assert.equal(codex.signal.aborted, true);
  assert.equal(claude.signal.aborted, false);
  await quotas.refresh();
  assert.equal(quotas.available("codex"), true);
});

test("per-model and provider-wide stops lift independently; a changed reason is neither lift nor new stop", async () => {
  const model = defaults.roles.implementation.models.codex;
  let stops: { reason: string; model?: string }[] = [];
  const quotas = new Quotas(defaults, scripted({}), [() => stops]);
  const all: string[] = [];
  const log = console.log;
  console.log = (line: string) => void all.push(line);
  try {
    stops = [{ reason: "wide 4%" }, { model, reason: "model" }];
    await quotas.refresh();
    stops = [{ reason: "wide 3%" }, { model, reason: "model" }];
    await quotas.refresh();
    assert.equal(quotas.disabled.get("codex"), "wide 4%");
    assert.equal(all.filter((line) => line.includes("codex")).length, 2);
    stops = [{ model, reason: "model" }];
    await quotas.refresh();
    assert.equal(quotas.available("codex", model), false);
    assert.equal(quotas.disabled.has("codex"), false);
    stops = [];
    await quotas.refresh();
    assert.equal(quotas.available("codex", model), true);
  } finally {
    console.log = log;
  }
  const logs = all.filter((line) => line.includes("codex"));
  assert.deepEqual(logs.slice(2), [
    "[quota] codex stop lifted (was: wide 4%)",
    `[quota] codex (${model}) stop lifted (was: model)`,
  ]);
});

test("a failed read blocks starts, leaves live sessions, and lifts on the next good read", async () => {
  const { scheduler: s, quotas } = await scheduler(
    {},
    { codex: [reading(), new Error("down"), reading()] },
  );
  const held = s.pick("implementation", issue(1))!;
  assert.equal(held.provider, "codex");
  await quotas.refresh();
  assert.equal(quotas.available("codex"), false);
  assert.equal(held.signal.aborted, false);
  assert.equal(s.pick("implementation", issue(2))!.provider, "claude");
  await quotas.refresh();
  assert.equal(quotas.available("codex"), true);
});

test("an interrupt starts nothing new and is not a quota stop", async () => {
  const { scheduler: s, quotas } = await scheduler();
  const held = s.reserve("codex", defaults.roles.implementation.models.codex);
  s.stop();
  assert.equal(held.signal.aborted, true);
  assert.equal(s.pick("implementation", issue(1)), undefined);
  assert.equal(quotas.disabled.size, 0);
  await quotas.refresh();
  assert.equal(s.pick("implementation", issue(1)), undefined);
});

test("a failed read does not mask a following quota stop", async () => {
  const { scheduler: s, quotas } = await scheduler(
    {},
    {
      codex: [reading(), new Error("down"), reading({ fiveHour: 1 })],
    },
  );
  const held = s.pick("implementation", issue(1))!;
  assert.equal(held.provider, "codex");
  await quotas.refresh();
  assert.equal(held.signal.aborted, false);
  await quotas.refresh();
  assert.equal(held.signal.aborted, true);
  assert.match(quotas.disabled.get("codex")!, /fiveHour remaining/);
});

test("sticky implementer moves at once when stopped and never moves back after the lift", async () => {
  const { scheduler: s, quotas } = await scheduler(
    {},
    { codex: [reading({ fiveHour: 50 }), reading({ fiveHour: 3 }), reading()] },
  );
  const job: { implementer?: Provider } = { implementer: "codex" };
  assert.equal(s.pick("implementation", issue(1), job)!.provider, "codex");
  await quotas.refresh(); // codex stopped
  const moved = s.pick("implementation", issue(1), job)!;
  assert.equal(moved.provider, "claude");
  job.implementer = moved.provider; // the stage succeeded
  await quotas.refresh(); // codex lifted
  assert.equal(quotas.available("codex"), true);
  assert.equal(s.pick("implementation", issue(1), job)!.provider, "claude");
});

test("a job without an implementer yet takes the ranker's pick for any role", async () => {
  const { scheduler: s } = await scheduler();
  assert.equal(s.pick("review", issue(1), {})!.provider, "codex");
});

test("review is re-picked each round by the ranker, even when it picks the implementer", async () => {
  const { scheduler: s, quotas } = await scheduler();
  const job = { implementer: "codex" as Provider };
  assert.equal(s.pick("review", issue(1), job)!.provider, "codex");
  // A ranker that puts claude first moves the review off the implementer.
  s.ranker = ({ candidates }) =>
    [...candidates].reverse().map((c) => c.provider);
  assert.equal(s.pick("review", issue(1), job)!.provider, "claude");
  quotas.disableModel("claude", defaults.roles.review.models.claude, "stop");
  assert.equal(s.pick("review", issue(1), job)!.provider, "codex");
  quotas.disableModel("codex", defaults.roles.review.models.codex, "stop");
  assert.equal(s.pick("review", issue(1), job), undefined);
});

test("a per-model stop gives none for one role while another stage can start", async () => {
  const { scheduler: s, quotas } = await scheduler();
  for (const provider of ["codex", "claude"] as const)
    quotas.disableModel(provider, defaults.roles.review.models[provider], "x");
  assert.equal(s.pick("review", issue(1), { implementer: "codex" }), undefined);
  assert.ok(s.pick("implementation", issue(2)));
});

test("wakeAt is the earliest stopped reset plus a minute, capped at 30 minutes; none with no stops", async () => {
  const T = Date.now();
  const at = (seconds: number) => Math.floor(T / 1000) + seconds;
  const stopped = (resetsAt: number) => reading({ fiveHour: 0, resetsAt });
  const make = async (queues: Parameters<typeof scripted>[0]) => {
    const { scheduler: s } = await scheduler({}, queues);
    s.clock = { now: () => T, wait: async () => {} };
    return s;
  };
  const near = await make({
    claude: [stopped(at(600))],
    codex: [stopped(at(1200))],
  });
  assert.equal(near.wakeAt(), at(600) * 1000 + 60_000);
  assert.match(
    near.wakePlan()!.detail,
    /^sleeping until \d\d:\d\d \(codex: reset \d\d:\d\d; claude: reset /,
  );
  const far = await make({
    claude: [stopped(at(7200))],
    codex: [stopped(at(9000))],
  });
  assert.equal(far.wakeAt(), T + 30 * 60_000);
  const failed = await make({
    claude: [new Error("down")],
    codex: [stopped(at(7200))],
  });
  assert.equal(failed.wakeAt(), T + 30 * 60_000);
  assert.match(
    failed.wakePlan()!.detail,
    /claude: usage could not be verified, recheck/,
  );
  // A failed read must not borrow the old reading's reset.
  const mixed = await make({
    claude: [new Error("down")],
    codex: [stopped(at(300))],
  });
  assert.equal(mixed.wakeAt(), at(300) * 1000 + 60_000);
  assert.equal((await make({})).wakeAt(), undefined);
});

test("nextPollAt is none at 0 running, else the last refresh plus the interval, pushed back by a re-read", async () => {
  const clock = testClock();
  const config = { ...defaults, pollIntervalMs: 60_000 };
  const quotas = new Quotas(config, scripted({}));
  const s = new Scheduler({ config, quotas, clock });
  await s.refresh();
  assert.equal(s.nextPollAt(), undefined);
  const held = s.pick("implementation", issue(1))!;
  assert.equal(s.nextPollAt(), 1_000_000 + 60_000);
  await clock.wait(30_000);
  // A pick-time or wake re-read counts as a refresh.
  await s.refresh();
  assert.equal(s.nextPollAt(), 1_030_000 + 60_000);
  held.release();
  assert.equal(s.nextPollAt(), undefined);
});

test("poll() with a model stop aborts only same-key signals", async () => {
  const model = defaults.roles.implementation.models.claude;
  const { scheduler: s } = await scheduler(
    {},
    { claude: [reading(), reading({ models: { [model]: 3 } })] },
  );
  const same = s.reserve("claude", model);
  const otherModel = s.reserve("claude", "some-other-model");
  const otherProvider = s.reserve(
    "codex",
    defaults.roles.implementation.models.codex,
  );
  await s.poll();
  assert.equal(same.signal.aborted, true);
  assert.equal(otherModel.signal.aborted, false);
  assert.equal(otherProvider.signal.aborted, false);
});

test("poll() with a failed read leaves signals alone", async () => {
  const { scheduler: s } = await scheduler(
    {},
    { codex: [reading(), new Error("down")] },
  );
  const held = s.reserve("codex", defaults.roles.implementation.models.codex);
  await s.poll();
  assert.equal(held.signal.aborted, false);
  assert.equal(s.quotas.available("codex"), false);
});

test("a throwing stop module is a failed read naming the module, lifted by the next good pass", async () => {
  let broken = false;
  const config = { ...defaults, providers: ["codex" as Provider] };
  const quotas = new Quotas(config, scripted({}), [
    () => {
      if (broken)
        throw new StopConditionError("Stop condition module x.mjs: boom");
      return [];
    },
  ]);
  const s = new Scheduler({ config, quotas });
  await s.refresh();
  const held = s.reserve("codex", defaults.roles.implementation.models.codex);
  broken = true;
  await s.poll();
  assert.equal(quotas.available("codex"), false);
  assert.match(quotas.disabled.get("codex")!, /x\.mjs: boom/);
  assert.equal(held.signal.aborted, false);
  assert.equal(quotas.interrupted, false);
  broken = false;
  await s.poll();
  assert.equal(quotas.available("codex"), true);
});

test("a provider-limit stop holds until its reset (30 min with none), feeds wakeAt, then follows the normal rule", async () => {
  const { scheduler: s, quotas } = await scheduler();
  const clock = testClock();
  s.clock = clock;
  const T = clock.now();
  const model = defaults.roles.implementation.models.claude;
  s.limitStop("claude", model, { type: "five_hour", resetsAt: T + 600_000 });
  assert.equal(quotas.available("claude", model), false);
  // The fresh reading shows plenty of quota, yet the hold stays.
  await s.refresh();
  assert.equal(quotas.available("claude", model), false);
  assert.equal(s.wakeAt(), T + 600_000 + 60_000);
  await clock.wait(600_001);
  await s.refresh();
  assert.equal(quotas.available("claude", model), true);
  assert.equal(s.wakeAt(), undefined);
  // No reset given: 30 minutes.
  s.limitStop("codex", defaults.roles.implementation.models.codex, {});
  assert.equal(s.wakeAt(), clock.now() + 30 * 60_000);
  await clock.wait(29 * 60_000);
  await s.refresh();
  assert.equal(quotas.available("codex"), false);
  await clock.wait(60_001);
  await s.refresh();
  assert.equal(quotas.available("codex"), true);
});

test("a provider-limit stop cancels only same-key sessions; a Claude per-model bucket stops that model", async () => {
  const { scheduler: s, quotas } = await scheduler({
    roles: {
      ...defaults.roles,
      review: {
        ...defaults.roles.review,
        models: { ...defaults.roles.review.models, claude: "claude-sonnet-x" },
      },
      implementation: {
        ...defaults.roles.implementation,
        models: {
          ...defaults.roles.implementation.models,
          claude: "claude-opus-x",
        },
      },
    },
  });
  const opus = s.reserve("claude", "claude-opus-x");
  const sonnet = s.reserve("claude", "claude-sonnet-x");
  const codex = s.reserve("codex", "gpt");
  s.limitStop("claude", "claude-opus-x", { type: "seven_day_opus" });
  assert.equal(opus.signal.aborted, true);
  assert.equal(sonnet.signal.aborted, false);
  assert.equal(codex.signal.aborted, false);
  assert.equal(quotas.available("claude", "claude-sonnet-x"), true);
  assert.equal(quotas.available("claude", "claude-opus-x"), false);
  s.limitStop("claude", "claude-sonnet-x", { type: "five_hour" });
  assert.equal(sonnet.signal.aborted, true);
  assert.equal(codex.signal.aborted, false);
});

test("an ambiguous failure is a quota stop only when a fresh reading stops the provider", async () => {
  const quotas = new Quotas(
    defaults,
    scripted({ codex: [reading(), reading({ fiveHour: 2 })] }),
  );
  await quotas.refresh();
  const s = new Scheduler({ config: defaults, quotas });
  assert.equal(quotas.available("codex"), true);
  await s.refresh();
  assert.equal(quotas.available("codex"), false);
  await s.refresh();
  assert.equal(quotas.available("claude"), true);
});
