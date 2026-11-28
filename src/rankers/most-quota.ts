import { weeklyLeft } from "../quota.ts";
import type { Ranker } from "../policy.ts";

// Weekly left for the model, then five-hour, then a coin flip; `running` is ignored.
const ranker: Ranker = ({ candidates }) =>
  candidates
    .map(({ provider, model, reading }) => ({
      provider,
      weekly: Math.floor(weeklyLeft(reading, model, provider)),
      fiveHour: Math.floor(reading.fiveHour?.remainingPercent ?? 100),
      tie: Math.random(),
    }))
    .sort(
      (a, b) => b.weekly - a.weekly || b.fiveHour - a.fiveHour || b.tie - a.tie,
    )
    .map(({ provider }) => provider);
export default ranker;
