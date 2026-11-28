import test from "node:test";
import assert from "node:assert/strict";
import { defaults, type Provider } from "../src/config.ts";
import { Quotas, type ReadUsage, type Reading } from "../src/quota.ts";
import { Scheduler, type Clock } from "../src/scheduler.ts";
import { planJson, planPass, planText } from "../src/plan.ts";
import type { Job } from "../src/runner.ts";

process.env.TZ = "UTC";
// Top of the current hour: real enough for reading validation, round enough to print.
const NOW = Math.floor(Date.now() / 3_600_000) * 3_600_000;
const hhmm = (ms: number) => new Date(ms).toISOString().slice(11, 16);
const R = hhmm(NOW + 3_600_000);
const RECHECK = hhmm(NOW + 1_800_000);
const RESET = NOW / 1000 + 3600;
const clock: Clock = { now: () => NOW, wait: async () => {} };
const reading = ({
  fiveHour = 50,
  weekly = 50,
  allowed = null as boolean | null,
} = {}): Reading => ({
  observedAt: Date.now(),
  allowed,
  fiveHour: { remainingPercent: fiveHour, resetsAt: RESET },
  weekly: { remainingPercent: weekly, resetsAt: RESET },
  weeklyByModel: {},
});
const issue = (number: number, labels: string[] = []) => ({
  number,
  labels,
  title: `Issue ${number}`,
});
const safe = (number: number) => issue(number, ["parallel-safe"]);

async function setup(
  readings: Partial<Record<Provider, Reading | Error>> = {},
  overrides: Partial<typeof defaults> = {},
) {
  const config = { ...defaults, maxParallelIssues: 2, ...overrides };
  const read: ReadUsage = async (provider) => {
    const r = readings[provider] ?? reading();
    if (r instanceof Error) throw r;
    return r;
  };
  const quotas = new Quotas(config, read);
  await quotas.refresh();
  const scheduler = new Scheduler({ config, quotas, clock });
  return { scheduler, quotas, config };
}
const text = (
  scheduler: Scheduler,
  issues: ReturnType<typeof issue>[],
  jobs = {},
) => planText(scheduler, planPass(scheduler, issues, jobs));

test("plan text: healthy providers, free slots and a would-sleep no", async () => {
  const { scheduler } = await setup();
  assert.equal(
    text(scheduler, [safe(1), safe(2), safe(3)]),
    `Providers
  codex: 5h 50% left (resets ${R}), weekly 50% left (resets ${R}), running 0
  claude: 5h 50% left (resets ${R}), weekly 50% left (resets ${R}), running 0

Slots
  0 of 2 free (held by #1, #2)

Next stages (ranking: balanced)
  #1 Issue 1: implementation → codex (${defaults.roles.implementation.models.codex})
  #2 Issue 2: implementation → codex (${defaults.roles.implementation.models.codex})
  #3 Issue 3: implementation — not started: no free slot

Would sleep: no`,
  );
});

test("plan text: a non-parallel-safe issue waits", async () => {
  const { scheduler } = await setup();
  const out = text(scheduler, [safe(1), issue(2)]);
  assert.match(
    out,
    /#2 Issue 2: implementation — waits: not parallel-safe, #1 running/,
  );
  assert.match(out, /1 of 2 free \(held by #1\)/);
});

test("plan text: each stop kind with its lift line, and would sleep", async () => {
  const { scheduler, quotas } = await setup({
    codex: reading({ fiveHour: 3 }),
    claude: reading({ allowed: false }),
  });
  // claude: ordinary-usage stop is codex-only, so force a failed read and a limit instead.
  quotas.unverified.add("claude");
  quotas.disable("claude", "subscription usage could not be verified: boom");
  scheduler.limitStop("codex", defaults.roles.implementation.models.codex, {
    type: "five_hour",
    resetsAt: RESET * 1000,
  });
  const out = text(scheduler, [safe(1)]);
  assert.match(
    out,
    new RegExp(
      `stop codex: fiveHour remaining 3% \\(stop at 5%\\); lifts when a reading is above 5% \\(resets ${R}\\)`,
    ),
  );
  assert.match(
    out,
    /stop claude: subscription usage could not be verified: boom; recheck on next read/,
  );
  assert.match(
    out,
    /#1 Issue 1: implementation — codex stopped for .*, claude stopped for /,
  );
  assert.match(out, new RegExp(`Would sleep until ${RECHECK} \\(`));
  assert.match(out, /claude: usage could not be verified, recheck/);
});

test("plan text: limit failure is held until its time; ordinary usage lifts on a reading", async () => {
  const { scheduler } = await setup({ codex: reading({ allowed: false }) });
  const model = defaults.roles.implementation.models.claude;
  scheduler.limitStop("claude", model, { resetsAt: RESET * 1000 });
  const out = text(scheduler, []);
  assert.match(
    out,
    new RegExp(`stop claude: .*held until ${R}; held until ${R}`),
  );
  assert.match(
    out,
    /stop codex: provider reports ordinary usage not allowed; lifts when a reading allows it; recheck on next read/,
  );
});

test("a resumed review job previews the review stage and round; reservations are released", async () => {
  const { scheduler } = await setup();
  const jobs = {
    5: { number: 5, status: "review", reviewRounds: 2 } as Job,
  };
  const pass = planPass(scheduler, [issue(5)], jobs);
  assert.match(planText(scheduler, pass), /#5 Issue 5: review \(round 2\) → /);
  for (const provider of defaults.providers)
    assert.equal(scheduler.running(provider), 0);
});

test("--json shape", async () => {
  const { scheduler } = await setup();
  const json = planJson(scheduler, planPass(scheduler, [issue(1)], {}));
  assert.deepEqual(Object.keys(json), [
    "quotas",
    "unavailable",
    "unavailableModels",
    "next",
  ]);
  assert.deepEqual(json.next, [
    {
      issue: 1,
      title: "Issue 1",
      stage: "implementation",
      provider: "codex",
      model: defaults.roles.implementation.models.codex,
    },
  ]);
});
