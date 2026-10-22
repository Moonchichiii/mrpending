import { Blueprint, Form, MAX_STEPS } from '@pending/contract';
import { expect, test } from 'vitest';
import catapultBlueprint from '../fixtures/catapult/blueprint.json';
import catapultEvents from '../fixtures/catapult/events.json';
import catapultForm from '../fixtures/catapult/form.json';
import lostBlueprint from '../fixtures/lost/blueprint.json';
import lostEvents from '../fixtures/lost/events.json';
import lostForm from '../fixtures/lost/form.json';
import pressedBlueprint from '../fixtures/pressed/blueprint.json';
import pressedEvents from '../fixtures/pressed/events.json';
import pressedForm from '../fixtures/pressed/form.json';
import seesawBlueprint from '../fixtures/seesaw/blueprint.json';
import seesawEvents from '../fixtures/seesaw/events.json';
import seesawForm from '../fixtures/seesaw/form.json';
import stalledBlueprint from '../fixtures/stalled/blueprint.json';
import stalledEvents from '../fixtures/stalled/events.json';
import stalledForm from '../fixtures/stalled/form.json';
import { handovers, simulate } from './simulate';
import { validate } from './validate';

const fixtures = [
  { name: 'pressed', blueprint: pressedBlueprint, form: pressedForm, events: pressedEvents },
  { name: 'lost', blueprint: lostBlueprint, form: lostForm, events: lostEvents },
  { name: 'stalled', blueprint: stalledBlueprint, form: stalledForm, events: stalledEvents },
  { name: 'seesaw', blueprint: seesawBlueprint, form: seesawForm, events: seesawEvents },
  { name: 'catapult', blueprint: catapultBlueprint, form: catapultForm, events: catapultEvents },
];

const machine = (...parts: unknown[]) => Blueprint.parse({ title: 'Test', parts });
const conveyor = (id: string, cell: string, length: number) => ({
  id,
  kind: 'conveyor',
  cell,
  dir: 'east',
  length,
});
const ids = (blueprint: Blueprint) =>
  handovers(blueprint, simulate(blueprint)).map(({ step, from, to }) => ({
    step,
    from: from.id,
    to: to === 'button' ? to : to.id,
  }));

test.each(fixtures)('$name replays its frozen events byte for byte', ({ blueprint, form, events }) => {
  expect(validate(blueprint, Form.parse(form))).toEqual([]);
  expect(JSON.stringify(simulate(Blueprint.parse(blueprint)))).toBe(JSON.stringify(events));
});

test('the seesaw fixture without its fan stalls at H7', () => {
  const seesaw = Blueprint.parse(seesawBlueprint);
  const events = simulate({ ...seesaw, parts: seesaw.parts.filter((p) => p.kind !== 'fan') });
  expect(events.slice(-2)).toEqual([
    { type: 'ball.moved', step: 10, from: 'H6', to: 'H7', by: 'gravity' },
    { type: 'ball.stopped', step: 11, cell: 'H7' },
  ]);
});

test('a ball landing on a load end from an arc is launched', () => {
  const blueprint = machine(
    { id: 'p1', kind: 'catapult', cell: 'A6', dir: 'east', power: 3 },
    { id: 'p2', kind: 'seesaw', cell: 'E4', dir: 'east' },
  );
  expect(validate(blueprint, Form.parse(pressedForm))).toEqual([]);
  const events = simulate(blueprint);
  expect(events.filter((e) => e.type === 'ball.launched')).toEqual([
    { type: 'ball.launched', step: 6, from: 'A6', to: 'D4', by: 'catapult', part: 'p1' },
    { type: 'ball.launched', step: 7, from: 'D4', to: 'H2', by: 'seesaw', part: 'p2' },
  ]);
  expect(events.at(-1)).toEqual({ type: 'ball.stopped', step: 13, cell: 'H7' });
});

test('dominoes facing each other end in impulse.lost at the fallen domino', () => {
  const blueprint = machine(
    conveyor('p1', 'A2', 2),
    { id: 'p2', kind: 'dominoes', cell: 'B7', dir: 'east', length: 2 },
    { id: 'p3', kind: 'dominoes', cell: 'E7', dir: 'west', length: 2 },
  );
  expect(validate(blueprint, Form.parse(pressedForm))).toEqual([]);
  expect(simulate(blueprint).slice(-4)).toEqual([
    { type: 'ball.moved', step: 8, from: 'C6', to: 'C7', by: 'gravity' },
    { type: 'domino.fell', step: 9, part: 'p2', index: 1, cell: 'C7' },
    { type: 'domino.fell', step: 10, part: 'p3', index: 1, cell: 'D7' },
    { type: 'impulse.lost', step: 11, cell: 'C7' },
  ]);
  expect(ids(blueprint).slice(-2)).toEqual([
    { step: 10, from: 'p2', to: 'p3' },
    { step: 11, from: 'p3', to: 'p2' },
  ]);
});

test('a ball resting in K7 does not press the button', () => {
  const events = simulate(machine(conveyor('p1', 'A2', 6), conveyor('p2', 'G2', 4)));
  expect(events.slice(-2)).toEqual([
    { type: 'ball.moved', step: 16, from: 'K6', to: 'K7', by: 'gravity' },
    { type: 'ball.stopped', step: 17, cell: 'K7' },
  ]);
});

test('a part pointing at L7 does not press the button', () => {
  const events = simulate(machine({ id: 'p1', kind: 'dominoes', cell: 'J7', dir: 'east', length: 2 }));
  expect(events.at(-1)).toEqual({ type: 'ball.stopped', step: 7, cell: 'A7' });
  expect(events.some((e) => e.type === 'button.pressed' || e.type === 'domino.fell')).toBe(false);
});

test('a ball falling into L7 presses the button', () => {
  const events = simulate(machine(conveyor('p1', 'A2', 6), conveyor('p2', 'G2', 5)));
  expect(events.slice(-2)).toEqual([
    { type: 'ball.moved', step: 17, from: 'L6', to: 'L7', by: 'gravity' },
    { type: 'button.pressed', step: 18, by: 'ball' },
  ]);
});

test('a ball circling in wind is stopped at step 200 where it is', () => {
  const circling = machine(
    conveyor('p1', 'A2', 2),
    { id: 'p2', kind: 'fan', cell: 'B4', dir: 'east', power: 2 },
    { id: 'p3', kind: 'fan', cell: 'F4', dir: 'west', power: 1 },
  );
  const events = simulate(circling);
  expect(events).toHaveLength(MAX_STEPS);
  expect(events.slice(-2)).toEqual([
    { type: 'ball.moved', step: 199, from: 'D4', to: 'E4', by: 'fan' },
    { type: 'ball.stopped', step: 200, cell: 'E4' },
  ]);
});

test('handovers on pressed: conveyor to ramp, ramp to dominoes, dominoes to button', () => {
  const blueprint = Blueprint.parse(pressedBlueprint);
  expect(ids(blueprint)).toEqual([
    { step: 5, from: 'p1', to: 'p2' },
    { step: 11, from: 'p2', to: 'p3' },
    { step: 15, from: 'p3', to: 'button' },
  ]);
});

test('handovers on seesaw: the fan wind counts as the fan', () => {
  const blueprint = Blueprint.parse(seesawBlueprint);
  expect(ids(blueprint)).toEqual([
    { step: 6, from: 'p1', to: 'p2' },
    { step: 7, from: 'p2', to: 'p3' },
    { step: 12, from: 'p3', to: 'p4' },
    { step: 15, from: 'p4', to: 'button' },
  ]);
});
