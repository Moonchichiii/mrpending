import { Attempt, Blueprint, Form, Patch } from '@pending/contract';
import { applyPatch, simulate, validate } from '@pending/machine';
import { expect, test } from 'vitest';
import invalidBlueprint from '../../packages/machine/fixtures/invalid/blueprint.json';
import invalidForm from '../../packages/machine/fixtures/invalid/form.json';
import lostBlueprint from '../../packages/machine/fixtures/lost/blueprint.json';
import lostForm from '../../packages/machine/fixtures/lost/form.json';
import repairedPatch from '../../packages/machine/fixtures/repaired/patch.json';
import pressedBlueprint from '../../packages/machine/fixtures/pressed/blueprint.json';
import { runBuild } from '@pending/agent';
import type { Infer } from '@pending/agent';
import {
  percentile,
  pressOrigin,
  recorded,
  repairEffects,
  replaysIdentically,
  summarize,
  violationKind,
} from './metrics';

// A scripted model: the design, then one reply per repair call in order; a reply that runs out repeats the last.
function scripted(design: unknown, repairs: unknown[]): Infer {
  let n = 0;
  return async (call) => {
    if (call.kind === 'design') return { value: design, timing: { wallMs: 900 } };
    n += 1;
    return { value: repairs[Math.min(n, repairs.length) - 1], timing: { wallMs: 400 } };
  };
}
const build = (scenario: string, infer: Infer) =>
  recorded(
    scenario,
    runBuild({
      id: `b-${scenario}`,
      form: Form.parse(lostForm),
      system: 'instructions',
      promptVersion: 'v2',
      model: { mode: 'local', id: 'gemma4:e2b', host: 'ollama' },
      repairs: 5,
      infer,
      signal: new AbortController().signal,
      now: () => new Date('2026-10-22T12:00:00.000Z'),
    }),
  );

test('violation kinds are read from what validate() actually says', () => {
  const kinds = validate(invalidBlueprint, Form.parse(invalidForm)).map(violationKind);
  expect(kinds).toEqual(['overlap', 'constraint']);
  expect(violationKind('p3 at K2 runs off the east edge of the board')).toBe('footprint');
  expect(violationKind('p2: length must be at most 4')).toBe('parameter');
});

test('a repair counts when both trials ran and the later one pressed; an unrun trial never counts', () => {
  const form = Form.parse(lostForm);
  const lost = Blueprint.parse(lostBlueprint);
  const patch = Patch.parse(repairedPatch);
  const repaired = applyPatch(lost, patch, new Set(), form).blueprint;
  const attempts = [
    Attempt.parse({
      n: 1,
      blueprint: lost,
      violations: [],
      events: simulate(lost),
      outcome: 'lost',
      failedAt: 'L3',
    }),
    Attempt.parse({
      n: 2,
      blueprint: repaired,
      violations: [],
      events: simulate(repaired),
      outcome: 'pressed',
      patch,
    }),
    Attempt.parse({
      n: 3,
      blueprint: lost,
      violations: ['x overlaps y at B2'],
      events: [],
      outcome: 'invalid',
      patch,
    }),
  ];
  expect(repairEffects(attempts).map((r) => r.changedOutcome)).toEqual([true, false]);
  expect(attempts.every(replaysIdentically)).toBe(true);
  const tampered = Attempt.parse({ ...attempts[0], events: simulate(repaired) });
  expect(replaysIdentically(tampered)).toBe(false);
});

test('a detour that fails later at the same cell is not an outcome-changing repair', () => {
  const lost = Blueprint.parse(lostBlueprint);
  const events = simulate(lost);
  const before = Attempt.parse({
    n: 1,
    blueprint: lost,
    violations: [],
    events,
    outcome: 'lost',
    failedAt: 'L3',
  });
  const later = events.map((e, i) => (i === events.length - 1 ? { ...e, step: e.step + 4 } : e));
  const after = Attempt.parse({ ...before, n: 2, events: later });
  expect(repairEffects([before, after])).toMatchObject([
    { before: { failedAt: 'L3' }, after: { failedAt: 'L3' }, changedOutcome: false },
  ]);
});

test('a repair call that times out keeps the finished attempt and its timings, with the error beside them', async () => {
  const lost = Blueprint.parse(lostBlueprint);
  let calls = 0;
  const infer: Infer = async () => {
    calls += 1;
    if (calls > 1) throw new Error('TimeoutError: the operation timed out');
    return { value: { blueprint: lost, memo: 'More catapult.' }, timing: { wallMs: 1200, loadMs: 200 } };
  };
  const entry = await recorded(
    'catapult',
    runBuild({
      id: 'b1',
      form: Form.parse(lostForm),
      system: 'instructions',
      promptVersion: 'v2',
      model: { mode: 'local', id: 'gemma4:e2b', host: 'ollama' },
      repairs: 5,
      infer,
      signal: new AbortController().signal,
      now: () => new Date('2026-10-22T12:00:00.000Z'),
    }),
  );
  expect(entry.run).toMatchObject({
    end: 'ERROR',
    error: 'Error: TimeoutError: the operation timed out',
    attempts: [{ n: 1, outcome: 'lost', failedAt: 'L3' }],
    calls: [
      { kind: 'design', parsed: true, tries: [{ timing: { wallMs: 1200, loadMs: 200 }, issues: [] }] },
      { kind: 'repair', attempt: 2, parsed: false, tries: [] },
    ],
  });
  const summary = summarize([entry], 1);
  expect(summary.simulator.simulatedFailures).toBe(1);
  expect(summary.latency.design.wallMs).toMatchObject({ n: 1, p95: 1200 });
  expect(summary.latency.coldLoadMs).toBe(200);
});

test('a press on the first attempt is the design, a later one a repair, and none is neither', async () => {
  const memo = 'More catapult.';
  const byDesign = await build('pressed', scripted({ blueprint: pressedBlueprint, memo }, []));
  const byRepair = await build(
    'lost',
    scripted({ blueprint: lostBlueprint, memo }, [{ patch: repairedPatch, memo }]),
  );
  const never = await build(
    'stuck',
    scripted({ blueprint: lostBlueprint, memo }, [{ patch: [{ op: 'remove', id: 'p99' }], memo }]),
  );
  const attempts = (e: typeof byDesign) => (e.run.end === 'done' ? e.run.build.attempts : []);
  expect(pressOrigin(attempts(byDesign))).toEqual({ by: 'design', attempt: 1 });
  expect(pressOrigin(attempts(byRepair))).toEqual({ by: 'repair', attempt: 2 });
  expect(pressOrigin(attempts(never))).toBeUndefined();
  expect(summarize([byDesign, byRepair, never]).simulator).toMatchObject({
    pressedRate: { hits: 2, n: 3 },
    pressedBy: { design: 1, repair: 1 },
    attemptsToPress: [1, 2],
  });
});

test('a repair is valid only when its reply parses and its patch applies without violations', async () => {
  const memo = 'More catapult.';
  const repaired = await build(
    'lost',
    scripted({ blueprint: lostBlueprint, memo }, [{ patch: repairedPatch, memo }]),
  );
  // A patch that removes a part not on the board, then a reply that never parses: two invalid repairs.
  const unrepaired = await build(
    'stuck',
    scripted({ blueprint: lostBlueprint, memo }, [
      { patch: [{ op: 'remove', id: 'p99' }], memo },
      { patch: 'nothing to see' },
    ]),
  );
  expect(unrepaired.run.end).toBe('MODEL_INVALID');
  const { simulator, schema } = summarize([repaired, unrepaired]);
  expect(simulator.repairValidity).toEqual({ hits: 1, n: 3 });
  expect(simulator.outcomeChangingRepairs).toBe(1);
  expect(schema.repairReplies).toEqual({ hits: 2, n: 4 });
});

test('a repair cut off during its re-ask counts as invalid but stays out of the under-animation timing', async () => {
  let repairs = 0;
  const infer: Infer = async (call) => {
    if (call.kind === 'design')
      return { value: { blueprint: lostBlueprint, memo: 'More catapult.' }, timing: { wallMs: 900 } };
    repairs += 1;
    if (repairs > 1) throw new Error('TimeoutError: the operation timed out');
    return { value: { patch: 'nothing to see' }, timing: { wallMs: 1 } };
  };
  const entry = await build('lost', infer);
  expect(entry.run.end).toBe('ERROR');
  const { simulator, latency } = summarize([entry]);
  expect(simulator.repairValidity).toEqual({ hits: 0, n: 1 });
  expect(latency.repairUnderAnimation).toEqual({ calls: { hits: 0, n: 0 } });
});

test('percentiles use the nearest rank and stay undefined without a sample', () => {
  expect(percentile([30, 10, 20, 40], 50)).toBe(20);
  expect(percentile([30, 10, 20, 40], 95)).toBe(40);
  expect(percentile([], 95)).toBeUndefined();
});
