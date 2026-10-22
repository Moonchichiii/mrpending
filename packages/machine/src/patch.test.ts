import { Blueprint, Form, MAX_PARTS, Patch } from '@pending/contract';
import { expect, test } from 'vitest';
import catapultBlueprint from '../fixtures/catapult/blueprint.json';
import catapultRepairedBlueprint from '../fixtures/catapult-repaired/blueprint.json';
import catapultRepairedEvents from '../fixtures/catapult-repaired/events.json';
import catapultRepairedForm from '../fixtures/catapult-repaired/form.json';
import catapultRepairedPatch from '../fixtures/catapult-repaired/patch.json';
import lostBlueprint from '../fixtures/lost/blueprint.json';
import repairedBlueprint from '../fixtures/repaired/blueprint.json';
import repairedEvents from '../fixtures/repaired/events.json';
import repairedForm from '../fixtures/repaired/form.json';
import repairedPatch from '../fixtures/repaired/patch.json';
import { applyPatch } from './patch';
import { simulate } from './simulate';

const fixtures = [
  {
    name: 'repaired',
    prev: lostBlueprint,
    patch: repairedPatch,
    next: repairedBlueprint,
    form: repairedForm,
    events: repairedEvents,
  },
  {
    name: 'catapult-repaired',
    prev: catapultBlueprint,
    patch: catapultRepairedPatch,
    next: catapultRepairedBlueprint,
    form: catapultRepairedForm,
    events: catapultRepairedEvents,
  },
];

const catapult = Blueprint.parse(catapultBlueprint);
const form = Form.parse(catapultRepairedForm);
const firstIds = new Set(catapult.parts.map((p) => p.id));
const patched = (patch: unknown, used: ReadonlySet<string> = firstIds) =>
  applyPatch(catapult, Patch.parse(patch), used, form);

test.each(fixtures)('$name: applyPatch(prev, patch) deep-equals next and replays to pressed', (f) => {
  const prev = Blueprint.parse(f.prev);
  const used = new Set(prev.parts.map((p) => p.id));
  const { blueprint, violations } = applyPatch(prev, Patch.parse(f.patch), used, Form.parse(f.form));
  expect(violations).toEqual([]);
  expect(blueprint).toEqual(Blueprint.parse(f.next));
  const events = simulate(blueprint);
  expect(JSON.stringify(events)).toBe(JSON.stringify(f.events));
  expect(events.at(-1)).toEqual({ type: 'button.pressed', step: 15, by: 'domino' });
});

test('an id removed earlier in the same patch cannot be added again', () => {
  const { blueprint, violations } = patched([
    { op: 'remove', id: 'p3' },
    { op: 'add', part: { id: 'p3', kind: 'catapult', cell: 'F6', dir: 'east', power: 4 } },
  ]);
  expect(violations).toContain('the patch adds p3, an id already used in this build');
  expect(blueprint.parts.map((p) => p.id)).toEqual(['p1', 'p2', 'p4', 'p5']);
});

test('an id used by an earlier attempt but no longer on the board cannot be added again', () => {
  const { violations } = patched(
    [{ op: 'add', part: { id: 'p9', kind: 'fan', cell: 'B5', dir: 'east', power: 1 } }],
    new Set([...firstIds, 'p9']),
  );
  expect(violations).toEqual(['the patch adds p9, an id already used in this build']);
});

test('an add that would exceed MAX_PARTS is skipped and reported', () => {
  const fans = Array.from({ length: MAX_PARTS - catapult.parts.length }, (_, i) => ({
    id: `p${i + 6}`,
    kind: 'fan' as const,
    cell: `${'BCDEFGHIJ'[i]}1`,
    dir: 'east' as const,
    power: 1,
  }));
  const full = Blueprint.parse({ title: catapult.title, parts: [...catapult.parts, ...fans] });
  const { blueprint, violations } = applyPatch(
    full,
    Patch.parse([{ op: 'add', part: { id: 'p15', kind: 'fan', cell: 'K1', dir: 'east', power: 1 } }]),
    new Set(full.parts.map((p) => p.id)),
    form,
  );
  expect(blueprint.parts).toEqual(full.parts);
  expect(violations).toEqual([
    'the patch adds p15, which would leave 15 parts on the board; the limit is 14',
  ]);
});

test('moving or removing an unknown id is a violation, including one removed by an earlier op', () => {
  const { blueprint, violations } = patched([
    { op: 'remove', id: 'p3' },
    { op: 'move', id: 'p3', cell: 'G6' },
    { op: 'remove', id: 'p8' },
  ]);
  expect(violations).toEqual([
    'the patch moves p3, which is not on the board',
    'the patch removes p8, which is not on the board',
    'the form requires a catapult part; there is none',
  ]);
  expect(blueprint.parts.map((p) => p.id)).toEqual(['p1', 'p2', 'p4', 'p5']);
});

test('the patched blueprint is validated like a fresh one', () => {
  const { blueprint, violations } = patched([{ op: 'move', id: 'p4', cell: 'F6' }]);
  expect(blueprint.parts.find((p) => p.id === 'p4')).toEqual({
    id: 'p4',
    kind: 'fan',
    cell: 'F6',
    dir: 'east',
    power: 2,
  });
  expect(violations).toEqual(['p4 overlaps p3 at F6']);
});
