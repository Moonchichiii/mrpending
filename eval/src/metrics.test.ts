import { Attempt, Blueprint, Form, Patch } from '@pending/contract';
import { applyPatch, simulate, validate } from '@pending/machine';
import { expect, test } from 'vitest';
import invalidBlueprint from '../../packages/machine/fixtures/invalid/blueprint.json';
import invalidForm from '../../packages/machine/fixtures/invalid/form.json';
import lostBlueprint from '../../packages/machine/fixtures/lost/blueprint.json';
import lostForm from '../../packages/machine/fixtures/lost/form.json';
import repairedPatch from '../../packages/machine/fixtures/repaired/patch.json';
import { runBuild } from '@pending/agent';
import type { Infer } from '@pending/agent';
import { percentile, recorded, repairEffects, replaysIdentically, summarize, violationKind } from './metrics';

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

test('percentiles use the nearest rank and stay undefined without a sample', () => {
  expect(percentile([30, 10, 20, 40], 50)).toBe(20);
  expect(percentile([30, 10, 20, 40], 95)).toBe(40);
  expect(percentile([], 95)).toBeUndefined();
});
