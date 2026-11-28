import { weeklyLeft } from "../quota.ts";
import type { Ranker } from "../policy.ts";

// Quota left (tighter of weekly-for-the-model and five-hour, rounded down) per session, plus one.
const ranker: Ranker = ({ candidates }) =>
  candidates
    .map(({ provider, model, reading, running }) => ({
      provider,
      score:
        Math.floor(
          Math.min(
            weeklyLeft(reading, model, provider),
            reading.fiveHour?.remainingPercent ?? 100,
          ),
        ) /
        (running + 1),
      tie: Math.random(),
    }))
    .sort((a, b) => b.score - a.score || b.tie - a.tie)
    .map(({ provider }) => provider);
export default ranker;
