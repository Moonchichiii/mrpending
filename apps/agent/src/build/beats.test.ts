import { Attempt, Blueprint, Form, Line, Patch } from '@pending/contract';
import { applyPatch } from '@pending/machine';
import { describe, expect, test } from 'vitest';
import lostForm from '../../../../packages/machine/fixtures/lost/form.json';
import { ASIDES, aside, corrections, trial } from './beats';
import type { AsideKey } from './beats';

const fan = { id: 'p1', kind: 'fan', cell: 'H4', dir: 'east', power: 2 };
const seesaw = { id: 'p2', kind: 'seesaw', cell: 'E6', dir: 'east' };
const conveyor = { id: 'p3', kind: 'conveyor', cell: 'A7', dir: 'east', length: 4 };

const attempt = (tail: unknown[], parts: unknown[] = [], outcome = 'stalled', n = 1): Attempt => {
  const events: unknown[] = [{ type: 'ball.released', step: 1, cell: 'A2' }, ...tail];
  const end = events.at(-1);
  const failedAt = typeof end === 'object' && end !== null && 'cell' in end ? end.cell : undefined;
  return Attempt.parse({
    n,
    blueprint: { title: 'Trial', parts },
    violations: outcome === 'invalid' ? ['p1 and p2 overlap at D3'] : [],
    events: outcome === 'invalid' ? [] : events,
    outcome,
    ...(outcome === 'invalid' ? {} : { failedAt }),
  });
};

describe('the aside is chosen by the terminal event and the event before it', () => {
  const rows: [string, Attempt, AsideKey][] = [
    [
      'catapult lost',
      attempt(
        [
          { type: 'ball.launched', step: 2, from: 'A2', to: 'L3', by: 'catapult', part: 'p4' },
          { type: 'ball.lost', step: 3, cell: 'L3', edge: 'east' },
        ],
        [],
        'lost',
      ),
      'catapultLost',
    ],
    [
      'seesaw lost',
      attempt(
        [
          { type: 'ball.launched', step: 2, from: 'I6', to: 'L4', by: 'seesaw', part: 'p2' },
          { type: 'ball.lost', step: 3, cell: 'L4', edge: 'east' },
        ],
        [{ ...seesaw, cell: 'J6' }],
        'lost',
      ),
      'seesawLost',
    ],
    [
      'other lost',
      attempt(
        [
          { type: 'ball.moved', step: 2, from: 'K6', to: 'L6', by: 'conveyor' },
          { type: 'ball.lost', step: 3, cell: 'L6', edge: 'east' },
        ],
        [],
        'lost',
      ),
      'otherLost',
    ],
    [
      'floor stop',
      attempt([
        { type: 'ball.moved', step: 2, from: 'A6', to: 'A7', by: 'gravity' },
        { type: 'ball.stopped', step: 3, cell: 'A7' },
      ]),
      'floorStop',
    ],
    [
      'fan stop',
      attempt(
        [
          { type: 'ball.launched', step: 2, from: 'F6', to: 'H4', by: 'catapult', part: 'p9' },
          { type: 'ball.stopped', step: 3, cell: 'H4' },
        ],
        [fan],
      ),
      'fanStop',
    ],
    [
      'seesaw stop',
      attempt(
        [
          { type: 'ball.moved', step: 2, from: 'F5', to: 'F6', by: 'gravity' },
          { type: 'ball.stopped', step: 3, cell: 'F6' },
        ],
        [seesaw],
      ),
      'seesawStop',
    ],
    [
      'impulse lost',
      attempt([
        { type: 'domino.fell', step: 2, part: 'p5', index: 0, cell: 'J7' },
        { type: 'impulse.lost', step: 3, cell: 'K7' },
      ]),
      'impulseLost',
    ],
    [
      'step cap',
      attempt([
        { type: 'ball.moved', step: 199, from: 'C4', to: 'D4', by: 'fan' },
        { type: 'ball.stopped', step: 200, cell: 'D4' },
      ]),
      'stepCap',
    ],
    ['invalid', attempt([], [], 'invalid'), 'invalid'],
  ];

  test.each(rows)('%s', (_, a, key) => {
    expect(aside(a, [])).toBe(ASIDES[key]);
  });
});

describe('an ambiguous sequence gets the finding only', () => {
  test('a stop after a conveyor exit', () => {
    const a = attempt(
      [
        { type: 'ball.moved', step: 2, from: 'D7', to: 'E7', by: 'conveyor' },
        { type: 'ball.stopped', step: 3, cell: 'E7' },
      ],
      [conveyor],
    );
    expect(aside(a, [])).toBeUndefined();
    expect(trial(a, [], true).map((l) => l.text)).toEqual([
      'Commencing trial 1.',
      'Finding: the ball came to rest at E7.',
      'A correction will be issued.',
      'This is why we employ snails.',
    ]);
  });

  test('a loss after a fan push', () => {
    const a = attempt(
      [
        { type: 'ball.moved', step: 2, from: 'K4', to: 'L4', by: 'fan' },
        { type: 'ball.lost', step: 3, cell: 'L4', edge: 'east' },
      ],
      [],
      'lost',
    );
    expect(aside(a, [])).toBeUndefined();
  });
});

test('the second identical key in a build yields the plain finding', () => {
  const tail = [
    { type: 'ball.launched', step: 2, from: 'A2', to: 'L3', by: 'catapult', part: 'p4' },
    { type: 'ball.lost', step: 3, cell: 'L3', edge: 'east' },
  ];
  const first = attempt(tail, [], 'lost', 1);
  const second = attempt(tail, [], 'lost', 2);
  expect(aside(second, [first])).toBeUndefined();
  expect(trial(second, [first], true).map((l) => [l.beat, l.text])).toEqual([
    ['running', 'Commencing trial 2.'],
    ['failed', 'Finding: the ball left the premises at L3.'],
    ['failed', 'A correction will be issued.'],
  ]);
});

test('a correction names each change applyPatch made, and never an op it skipped', () => {
  const previous = Blueprint.parse({
    title: 'Before',
    parts: [
      { id: 'p1', kind: 'catapult', cell: 'K6', dir: 'east', power: 2 },
      { id: 'p2', kind: 'ramp', cell: 'A2', dir: 'east', length: 2 },
    ],
  });
  const applied = (ops: unknown[]) =>
    applyPatch(previous, Patch.parse(ops), new Set(['p0']), Form.parse(lostForm)).blueprint;
  const patch = [
    { op: 'remove', id: 'p1' },
    { op: 'add', part: { id: 'p3', kind: 'seesaw', cell: 'K6', dir: 'west' } },
    { op: 'add', part: { id: 'p4', kind: 'fan', cell: 'L5', dir: 'west', power: 1 } },
    { op: 'move', id: 'p2', cell: 'B2' },
  ];
  // Skipped by applyPatch: p0 was used earlier in the build, p9 is not on the board.
  const skipped = [
    { op: 'add', part: { id: 'p0', kind: 'ramp', cell: 'C3', dir: 'east', length: 2 } },
    { op: 'move', id: 'p9', cell: 'D4' },
  ];
  expect(corrections(1, previous, applied(patch))).toEqual([
    'Correction 1: removed catapult at K6, added seesaw at K6 and fan at L5, moved ramp from A2 to B2.',
  ]);
  expect(corrections(1, previous, applied([...patch.slice(0, 2), ...skipped]))).toEqual([
    'Correction 1: removed catapult at K6, added seesaw at K6.',
  ]);
  expect(corrections(1, previous, applied(skipped))).toEqual([]);
});

test('a correction past the Line bound is split, so repeated part ids cannot end the build', () => {
  // Schema-valid but invalid: fourteen parts share one id, so one move changes every one of them.
  const cells = ['A2', 'B2', 'C2', 'D2', 'E2', 'F2', 'G2', 'A4', 'B4', 'C4', 'D4', 'E4', 'F4', 'G4'];
  const previous = Blueprint.parse({
    title: 'Repeated',
    parts: cells.map((cell) => ({ id: 'p1', kind: 'dominoes', cell, dir: 'east', length: 2 })),
  });
  const next = applyPatch(
    previous,
    Patch.parse([{ op: 'move', id: 'p1', cell: 'K6' }]),
    new Set(),
    Form.parse(lostForm),
  );
  const texts = corrections(1, previous, next.blueprint);
  expect(texts.length).toBeGreaterThan(1);
  for (const text of texts)
    expect(text).toMatch(/^Correction 1: moved dominoes from [A-G][24] to K6( and .+)?\.$/);
  const origins = [...texts.join(' ').matchAll(/dominoes from ([A-G][24]) to K6/g)].map((m) => m[1]);
  expect(origins).toEqual(cells);
  for (const text of texts)
    expect(() =>
      Line.parse({
        id: 'l1',
        beat: 'repaired',
        mood: 'slow',
        text,
        source: 'table',
        at: { attempt: 2, step: 0 },
      }),
    ).not.toThrow();
});

test('parts sharing an id are paired by position, so each origin cell is announced once', () => {
  const previous = Blueprint.parse({
    title: 'Shared',
    parts: [
      { id: 'p1', kind: 'ramp', cell: 'A2', dir: 'east', length: 2 },
      { id: 'p1', kind: 'ramp', cell: 'B2', dir: 'east', length: 2 },
    ],
  });
  const moved = (cell: string) =>
    applyPatch(previous, Patch.parse([{ op: 'move', id: 'p1', cell }]), new Set(), Form.parse(lostForm))
      .blueprint;
  expect(corrections(1, previous, moved('K6'))).toEqual([
    'Correction 1: moved ramp from A2 to K6 and ramp from B2 to K6.',
  ]);
  expect(corrections(1, previous, moved('B2'))).toEqual(['Correction 1: moved ramp from A2 to B2.']);
});
