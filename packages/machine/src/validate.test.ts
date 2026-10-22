import { Form, Part } from '@pending/contract';
import { expect, test } from 'vitest';
import invalidBlueprint from '../fixtures/invalid/blueprint.json';
import invalidForm from '../fixtures/invalid/form.json';
import { footprint, toCell, wind } from './catalogue';
import { validate } from './validate';

const form = Form.parse({
  nature: 'Press the blue button. Scenic route, please.',
  minParts: 2,
  maxParts: 14,
});
const blueprint = (...parts: unknown[]) => ({ title: 'Test', parts });
const conveyor = (id: string, cell: string, length = 4) => ({
  id,
  kind: 'conveyor',
  cell,
  dir: 'east',
  length,
});
const fan = (id: string, cell: string, dir: string, power: number) => ({ id, kind: 'fan', cell, dir, power });
const cells = (part: unknown) => footprint(Part.parse(part)).map(toCell);

test('each kind occupies its footprint toward dir, and only a fan has wind', () => {
  expect(cells({ ...conveyor('p1', 'F2'), dir: 'west' })).toEqual(['F2', 'E2', 'D2', 'C2']);
  expect(cells({ id: 'p1', kind: 'ramp', cell: 'C2', dir: 'east', length: 3 })).toEqual(['C2', 'D3', 'E4']);
  expect(cells({ id: 'p1', kind: 'dominoes', cell: 'K7', dir: 'west', length: 2 })).toEqual(['K7', 'J7']);
  expect(cells({ id: 'p1', kind: 'seesaw', cell: 'E6', dir: 'west' })).toEqual(['D6', 'E6', 'F6']);
  expect(cells({ id: 'p1', kind: 'catapult', cell: 'F6', dir: 'east', power: 5 })).toEqual(['F6']);
  expect(cells(fan('p1', 'G4', 'east', 2))).toEqual(['G4']);
  expect(wind(Part.parse(fan('p1', 'G4', 'west', 2))).map(toCell)).toEqual(['F4', 'E4']);
  expect(wind(Part.parse(conveyor('p1', 'A2')))).toEqual([]);
});

test('a sound blueprint has no violations', () => {
  const pressed = blueprint(
    conveyor('p1', 'A2'),
    { id: 'p2', kind: 'ramp', cell: 'E2', dir: 'east', length: 4 },
    { id: 'p3', kind: 'dominoes', cell: 'I7', dir: 'east', length: 3 },
  );
  expect(validate(pressed, form)).toEqual([]);
});

test('schema: names the part and the field, and never echoes the bad value', () => {
  expect(validate('a machine', form)).toEqual(['the blueprint is not an object with a title and parts']);
  const bad = {
    title: 'x'.repeat(41),
    parts: [
      conveyor('p1', 'M9'),
      { ...conveyor('p2', 'A3'), kind: 'laser' },
      { ...conveyor('p3', 'A4'), dir: 'up' },
      7,
    ],
  };
  expect(validate(bad, form)).toEqual([
    'the title is longer than 40 characters',
    'p1 has an invalid cell',
    'p2: kind must be one of ramp, dominoes, seesaw, catapult, conveyor or fan',
    'p3: dir must be east or west',
    'part 4 is not a part',
  ]);
});

test('duplicate ids', () => {
  expect(validate(blueprint(conveyor('p1', 'A2'), conveyor('p1', 'A4')), form)).toEqual([
    'id p1 is used by more than one part',
  ]);
});

test('parameter missing or out of range', () => {
  const parts = [
    { ...conveyor('p1', 'A2'), length: 7 },
    { id: 'p2', kind: 'fan', cell: 'C5', dir: 'east' },
  ];
  expect(validate(blueprint(...parts), form)).toEqual(['p1: length must be at most 6', 'p2 has no power']);
});

test('footprint outside the board names the part and the edge', () => {
  const parts = [
    conveyor('p1', 'J2'),
    { id: 'p2', kind: 'ramp', cell: 'B5', dir: 'east', length: 4 },
    { id: 'p3', kind: 'seesaw', cell: 'A3', dir: 'east' },
  ];
  expect(validate(blueprint(...parts), form)).toEqual([
    'p1 at J2 runs off the east edge of the board',
    'p2 at B5 runs off the bottom edge of the board',
    'p3 at A3 runs off the west edge of the board',
  ]);
});

test('overlap with another part names both parts and every shared cell', () => {
  const parts = [
    conveyor('p1', 'B4'),
    conveyor('p2', 'H4'),
    { id: 'p3', kind: 'seesaw', cell: 'D4', dir: 'east' },
  ];
  expect(validate(blueprint(...parts), form)).toEqual(['p3 overlaps p1 at C4, D4 and E4']);
});

test('A1 and L7 belong to the hopper and the button', () => {
  const parts = [conveyor('p1', 'A1', 2), { id: 'p2', kind: 'dominoes', cell: 'J7', dir: 'east', length: 3 }];
  expect(validate(blueprint(...parts), form)).toEqual([
    'p1 covers the hopper at A1',
    'p2 covers the button at L7',
  ]);
});

test('two fans with overlapping wind, whatever their directions', () => {
  const facing = blueprint(fan('p1', 'C4', 'east', 3), fan('p2', 'H4', 'west', 3));
  expect(validate(facing, form)).toEqual(['the wind of p1 and p2 overlaps at E4 and F4']);
  const apart = blueprint(fan('p1', 'C4', 'east', 2), fan('p2', 'H4', 'east', 2));
  expect(validate(apart, form)).toEqual([]);
});

test('part count within the form', () => {
  expect(validate(blueprint(conveyor('p1', 'A2')), form)).toEqual([
    'the blueprint has 1 part; the form asks for at least 2',
  ]);
  const small = Form.parse({ ...form, maxParts: 4 });
  const five = ['A2', 'A3', 'A4', 'A5', 'A6'].map((cell, i) => conveyor(`p${i + 1}`, cell));
  expect(validate(blueprint(...five), small)).toEqual([
    'the blueprint has 5 parts; the form allows at most 4',
  ]);
});

test('required kind present and forbidden kind absent', () => {
  const machine = blueprint(conveyor('p1', 'A2'), fan('p2', 'C5', 'east', 1), fan('p3', 'C6', 'east', 1));
  expect(validate(machine, Form.parse({ ...form, required: 'catapult', forbidden: 'fan' }))).toEqual([
    'the form requires a catapult part; there is none',
    'the form forbids fan parts: p2 and p3',
  ]);
});

test('the invalid fixture yields exactly its listed violations', () => {
  expect(validate(invalidBlueprint, Form.parse(invalidForm))).toEqual([
    'p2 overlaps p1 at D3 and E4',
    'the form forbids fan parts: p3',
  ]);
});
