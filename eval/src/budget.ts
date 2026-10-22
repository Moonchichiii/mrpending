import { percentile } from './metrics';

// Issue #10: the whole matrix, pilot included, gets three hours of machine time and never more.
export const BUDGET_MS = 3 * 60 * 60 * 1000;
// Five headline forms at k = 3 if it fits, else k = 2; never lower on the runner's own decision.
export const HEADLINE_K = [3, 2] as const;
export type HeadlineK = (typeof HEADLINE_K)[number];

export type PilotBuild = { scenario: string; cold: boolean; wallMs: number; modelCalls: number };
export type Pilot = { builds: PilotBuild[]; elapsedMs: number; switchMs: number };

// The forecast takes the slowest warm build as every warm build's length, so the plan errs long, not short.
export function pilotStats(pilot: Pilot) {
  const cold = pilot.builds.find((b) => b.cold);
  const warm = pilot.builds.filter((b) => !b.cold).map((b) => b.wallMs);
  const calls = pilot.builds.map((b) => b.modelCalls);
  const warmP50 = percentile(warm, 50);
  const warmP95 = percentile(warm, 95);
  if (cold === undefined || warmP50 === undefined || warmP95 === undefined)
    throw new Error('the pilot needs one cold and at least one warm build');
  return {
    coldBuildMs: cold.wallMs,
    warmBuildMs: { p50: warmP50, p95: warmP95 },
    coldStartOverheadMs: Math.max(0, cold.wallMs - warmP50),
    modelCalls: { p50: percentile(calls, 50), p95: percentile(calls, 95), max: Math.max(...calls) },
  };
}
export type PilotStats = ReturnType<typeof pilotStats>;

// One batch per configuration: a model switch, the cold first build (load included), then warm builds,
// all scaled by the model's measured speed relative to the pilot's model.
export type Batch = { factor: number; builds: number };
export function forecastMs(pilot: Pilot, stats: PilotStats, batches: readonly Batch[]): number {
  const batch = ({ factor, builds }: Batch) =>
    pilot.switchMs + factor * (stats.coldBuildMs + Math.max(0, builds - 1) * stats.warmBuildMs.p95);
  return pilot.elapsedMs + batches.reduce((sum, b) => sum + batch(b), 0);
}

export type Plan =
  | {
      go: true;
      k: HeadlineK;
      optionalTrap: boolean;
      forecastMs: { [K in HeadlineK]: number };
      plannedMs: number;
    }
  | { go: false; forecastMs: { [K in HeadlineK]: number }; shortfallMs: number };

// Fail closed: if the minimum matrix does not fit, nothing runs and the measured shortfall is the answer.
// Every configuration, the held-out form and the trap are always in; only the optional trap is ever left out.
export function plan(
  pilot: Pilot,
  factors: readonly number[],
  forms: { headline: number; single: number; optional: number },
  budgetMs = BUDGET_MS,
): Plan {
  const stats = pilotStats(pilot);
  const at = (k: number, extra: number) =>
    forecastMs(
      pilot,
      stats,
      factors.map((factor) => ({ factor, builds: forms.headline * k + forms.single + extra })),
    );
  const forecast = { 3: at(3, 0), 2: at(2, 0) };
  const k = HEADLINE_K.find((n) => forecast[n] <= budgetMs);
  if (k === undefined) return { go: false, forecastMs: forecast, shortfallMs: forecast[2] - budgetMs };
  const withOptional = at(k, forms.optional);
  const optionalTrap = forms.optional > 0 && withOptional <= budgetMs;
  return {
    go: true,
    k,
    optionalTrap,
    forecastMs: forecast,
    plannedMs: optionalTrap ? withOptional : forecast[k],
  };
}
