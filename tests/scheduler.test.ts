import test from "node:test";
import assert from "node:assert/strict";
import { defaults, type Provider } from "../src/config.ts";
import { Quotas, type ReadUsage, type Reading } from "../src/quota.ts";
import { Scheduler, type Clock } from "../src/scheduler.ts";

const reading = ({
  fiveHour = 50,
  weekly = 50,
  resetsAt = Math.floor(Date.now() / 1000) + 1000,
  models = {},
}: {
  fiveHour?: number;
  weekly?: number;
  resetsAt?: number;
  models?: Record<string, number>;
} = {}): Reading => ({
  observedAt: Date.now(),
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

async function scheduler(
  overrides: Partial<typeof defaults> = {},
  queues: Parameters<typeof scripted>[0] = {},
) {
  const config = { ...defaults, ranking: "order", ...overrides };
  const quotas = new Quotas(config, scripted(queues));
  await quotas.refresh();
  return { quotas, scheduler: new Scheduler({ config, quotas }) };
}

test("two picks in one pass see each other's running; release() decrements", async () => {
  const { scheduler: s } = await scheduler();
  const first = s.pick("implementation", issue(1))!;
  assert.equal(first.provider, "codex");
  assert.equal(s.running("codex"), 1);
  // The next fresh issue prefers the provider nothing is running on.
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
  assert.equal(s.pick("review", issue(1), job)!.provider, "claude");
  quotas.disable("claude", "test");
  assert.equal(s.pick("review", issue(1), job)!.provider, "codex");
  // A sticky implementer stays while it is usable, and moves for good once stopped.
  assert.equal(s.pick("implementation", issue(1), job)!.provider, "codex");
  quotas.disable("codex", "test");
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

test("a stop lifts on a reading above threshold", async () => {
  const { quotas } = await scheduler(
    {},
    { codex: [reading({ fiveHour: 3 }), reading({ fiveHour: 50 })] },
  );
  assert.equal(quotas.available("codex"), false);
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
