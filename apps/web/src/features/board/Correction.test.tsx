import { Blueprint, Patch } from '@pending/contract';
import { applyPatch } from '@pending/machine';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'vitest';
import { Board } from './Board';
import { diff, written } from './model/diff';
import styles from './Board.module.css';

afterEach(cleanup);

// Fixtures are external data: parsed at the boundary, like any record the board will draw.
const files = import.meta.glob<unknown>('../../../../../packages/machine/fixtures/*/*.json', {
  eager: true,
  import: 'default',
});
const file = (name: string, kind: string) =>
  files[`../../../../../packages/machine/fixtures/${name}/${kind}.json`];

const board = Blueprint.parse({
  title: 'Every op',
  parts: [
    { id: 'p1', kind: 'conveyor', cell: 'A2', dir: 'east', length: 3 },
    { id: 'p2', kind: 'ramp', cell: 'E2', dir: 'east', length: 2 },
    { id: 'p3', kind: 'catapult', cell: 'F6', dir: 'east', power: 2 },
    { id: 'p4', kind: 'fan', cell: 'H4', dir: 'west', power: 1 },
  ],
});
const patch = Patch.parse([
  { op: 'remove', id: 'p2' },
  { op: 'move', id: 'p4', cell: 'H3' },
  { op: 'remove', id: 'p3' },
  { op: 'add', part: { id: 'p5', kind: 'catapult', cell: 'F6', dir: 'east', power: 4 } },
]);
const extra = Patch.parse([
  { op: 'add', part: { id: 'p6', kind: 'dominoes', cell: 'J7', dir: 'east', length: 2 } },
]);

// The board a patch produces, as the machine applies it; the diff is marked on that board, over the parts that stand.
const FORM = { nature: 'x', minParts: 2, maxParts: 14 };
const applied = (previous: Blueprint, ops: Patch) => applyPatch(previous, ops, new Set(), FORM).blueprint;
const drawn = (previous: Blueprint, ops: Patch) =>
  render(<Board blueprint={applied(previous, ops)} events={[]} previous={previous} />);
const outside = (container: Element, id: string) =>
  [...container.querySelectorAll(`[data-part="${id}"]`)].filter((p) => p.closest('[data-change]') === null);
const group = (container: Element, kind: string) => [
  ...container.querySelectorAll(`[data-change="${kind}"]`),
];
const badges = (el: Element | undefined) =>
  [...(el?.querySelectorAll('[data-badge]') ?? [])].map((b) => b.getAttribute('data-badge'));

describe('diff symbols per op kind', () => {
  test('removed: dashed part, an X and a minus badge', () => {
    const { container } = drawn(board, patch);
    const [removed] = group(container, 'removed');
    expect(removed?.querySelector('[data-part="p2"]')).not.toBeNull();
    expect(removed?.querySelector('path:not([data-direction])')).not.toBeNull();
    expect(badges(removed)).toEqual(['−']);
  });

  test('added: the part on the board, a halo and a plus badge', () => {
    const { container } = drawn(board, extra);
    const [added] = group(container, 'added');
    expect(outside(container, 'p6')).toHaveLength(1);
    expect(added?.querySelector(':scope > circle')).not.toBeNull();
    expect(badges(added)).toEqual(['+']);
  });

  test('moved: the part at its new cell, an arrow from the old one and a label', () => {
    const { container } = drawn(board, patch);
    const [moved] = group(container, 'moved');
    expect(outside(container, 'p4')[0]?.getAttribute('transform')).toBe('translate(456 168)');
    // The arrow starts at the old anchor H4 (456, 224).
    expect(moved?.querySelector(':scope > path')?.getAttribute('d')).toMatch(/^M 456 224 L /);
    expect(moved?.querySelector('text')?.textContent).toBe('from H4');
    expect(badges(moved)).toEqual([]);
  });

  test('replaced: the old part removed and the new one added on the same cell, with both badges', () => {
    const { container } = drawn(board, patch);
    const [replaced] = group(container, 'replaced');
    expect(replaced?.querySelector('[data-part="p3"]')).not.toBeNull();
    expect(outside(container, 'p5')).toHaveLength(1);
    expect(badges(replaced)).toEqual(['−', '+']);
  });

  test('unchanged: the part on the board as it stands, with no mark', () => {
    const { container } = drawn(board, patch);
    const unchanged = group(container, 'unchanged');
    expect(unchanged).toHaveLength(1);
    expect(unchanged[0]?.childElementCount).toBe(0);
    expect(outside(container, 'p1')).toHaveLength(1);
  });

  test('the change list says each change in words, and the board describes it', () => {
    const changes = [
      'Removed ramp p2 at E2.',
      'Replaced catapult p3 at F6 with catapult p5 at F6 facing east, power 4.',
      'Moved fan p4 from H4 to H3.',
    ];
    expect(written(board, applied(board, patch))).toEqual(changes);
    const { container } = drawn(board, patch);
    for (const change of changes) expect(container.querySelector('desc')?.textContent).toContain(change);
  });
});

test("a removed fan's wind carries the fan's styling; the fan that stands is drawn as it is", () => {
  const fans = Blueprint.parse({
    title: 'Two fans',
    parts: [
      { id: 'p7', kind: 'fan', cell: 'B3', dir: 'east', power: 2 },
      { id: 'p8', kind: 'fan', cell: 'J5', dir: 'west', power: 1 },
    ],
  });
  const { container } = drawn(fans, Patch.parse([{ op: 'remove', id: 'p7' }]));
  const classes = (selector: string) => container.querySelector(selector)?.getAttribute('class')?.split(' ');
  expect(styles.removed).toBeTruthy();
  expect(classes('[data-part="p7"]')).toContain(styles.removed);
  expect(classes('[data-wind="p7"]')).toEqual([styles.wind, styles.removed]);
  expect(classes('[data-wind="p8"]')).toEqual([styles.wind]);
});

test('an op the machine skipped is not drawn or written', () => {
  // p1 is already on the board, so applyPatch skips the add and the board is unchanged.
  const reused = Patch.parse([
    { op: 'add', part: { id: 'p1', kind: 'fan', cell: 'K2', dir: 'west', power: 1 } },
  ]);
  const { container } = drawn(board, reused);
  expect(group(container, 'unchanged')).toHaveLength(board.parts.length);
  expect(container.querySelectorAll('[data-change] > *')).toHaveLength(0);
  expect(written(board, applied(board, reused))).toEqual([]);
});

describe('the diff of each recorded correction is drawn from the boards before and after it', () => {
  test.each([
    ['repaired', 'lost', ['unchanged', 'unchanged', 'unchanged', 'removed']],
    ['catapult-repaired', 'catapult', ['unchanged', 'unchanged', 'replaced', 'unchanged', 'moved']],
  ])('%s', (name, before, kinds) => {
    const previous = Blueprint.parse(file(before, 'blueprint'));
    const ops = Patch.parse(file(name, 'patch'));
    const after = Blueprint.parse(file(name, 'blueprint'));
    // The recorded board is the one the recorded patch produces (ARCHITECTURE section 2, replay invariant).
    expect(applied(previous, ops)).toEqual(after);
    const changes = diff(previous, after);
    expect(changes.map((c) => c.kind)).toEqual(kinds);
    // The parts the diff leaves standing are exactly the recorded board's.
    const standing = changes.flatMap((c) =>
      c.kind === 'removed' ? [] : c.kind === 'replaced' ? [c.added] : [c.part],
    );
    expect(new Set(standing.map((p) => JSON.stringify(p)))).toEqual(
      new Set(after.parts.map((p) => JSON.stringify(p))),
    );
  });
});
