import { expect, test } from 'vitest';
import { BUDGET_MS, pilotStats, plan } from './budget';
import type { Pilot } from './budget';

const s = (seconds: number) => seconds * 1000;
// Seven forms: a 60 s cold build, then 30 s warm builds; the pilot took 250 s and the model switch 5 s.
const pilot: Pilot = {
  builds: ['scenic', 'thrown', 'windless', 'budget', 'bureaucracy', 'downhill', 'trap'].map(
    (scenario, i) => ({
      scenario,
      cold: i === 0,
      wallMs: s(i === 0 ? 60 : 30),
      modelCalls: 2,
    }),
  ),
  elapsedMs: s(250),
  switchMs: s(5),
};
// A, B on E2B and D on E4B at twice the time per build.
const factors = [1, 1, 2];
const forms = { headline: 5, single: 2, optional: 1 };

test('the pilot separates the cold first build from the warm ones', () => {
  expect(pilotStats(pilot)).toMatchObject({
    coldBuildMs: s(60),
    warmBuildMs: { p50: s(30), p95: s(30) },
    coldStartOverheadMs: s(30),
  });
});

test('the forecast counts the pilot, every model switch and each batch cold start, and picks k = 3 when it fits', () => {
  // k = 3: 17 builds a batch; E2B 5 + 60 + 16 * 30 = 545 s twice, E4B 5 + 2 * (60 + 16 * 30) = 1085 s, pilot 250 s.
  const decided = plan(pilot, factors, forms);
  expect(decided).toEqual({
    go: true,
    k: 3,
    optionalTrap: true,
    forecastMs: { 3: s(2425), 2: s(1825) },
    plannedMs: s(2545),
  });
});

test('k falls to 2 when 3 does not fit, and the optional trap is left out before anything else', () => {
  expect(plan(pilot, factors, forms, s(2000))).toMatchObject({ go: true, k: 2, optionalTrap: true });
  expect(plan(pilot, factors, forms, s(1900))).toMatchObject({
    go: true,
    k: 2,
    optionalTrap: false,
    plannedMs: s(1825),
  });
});

test('fail closed: when even k = 2 with all three configurations does not fit, the plan stops with the shortfall', () => {
  const decided = plan(pilot, factors, forms, s(1800));
  expect(decided).toEqual({ go: false, forecastMs: { 3: s(2425), 2: s(1825) }, shortfallMs: s(25) });
  expect('k' in decided).toBe(false);
  // The measured three hours are the default budget.
  expect(BUDGET_MS).toBe(s(3 * 60 * 60));
});
