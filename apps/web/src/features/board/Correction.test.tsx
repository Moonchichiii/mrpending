import { Blueprint, Patch } from '@pending/contract';
import { applyPatch } from '@pending/machine';
import { cleanup, render, within } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'vitest';
import { Correction } from './Correction';
import { diff } from './model/diff';

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

// The board a patch produces, as the machine applies it; the diff is drawn between the two boards.
const FORM = { nature: 'x', minParts: 2, maxParts: 14 };
const applied = (previous: Blueprint, ops: Patch) => applyPatch(previous, ops, new Set(), FORM).blueprint;
const drawn = (previous: Blueprint, ops: Patch) =>
  render(<Correction n={2} previous={previous} current={applied(previous, ops)} />);
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

  test('added: a halo and a plus badge', () => {
    const { container } = drawn(board, extra);
    const [added] = group(container, 'added');
    expect(added?.querySelector('[data-part="p6"]')).not.toBeNull();
    expect(added?.querySelector(':scope > circle')).not.toBeNull();
    expect(badges(added)).toEqual(['+']);
  });

  test('moved: the part at its new cell, an arrow from the old one and a label', () => {
    const { container } = drawn(board, patch);
    const [moved] = group(container, 'moved');
    expect(moved?.querySelector('[data-part="p4"]')?.getAttribute('transform')).toBe('translate(456 168)');
    // The arrow starts at the old anchor H4 (456, 224).
    expect(moved?.querySelector(':scope > path')?.getAttribute('d')).toMatch(/^M 456 224 L /);
    expect(moved?.querySelector('text')?.textContent).toBe('from H4');
    expect(badges(moved)).toEqual([]);
  });

  test('replaced: the old part removed and the new one added on the same cell, with both badges', () => {
    const { container } = drawn(board, patch);
    const [replaced] = group(container, 'replaced');
    expect(replaced?.querySelector('[data-part="p3"]')).not.toBeNull();
    expect(replaced?.querySelector('[data-part="p5"]')).not.toBeNull();
    expect(badges(replaced)).toEqual(['−', '+']);
  });

  test('unchanged: the part alone, faded, with no badge', () => {
    const { container } = drawn(board, patch);
    const unchanged = group(container, 'unchanged');
    expect(unchanged.map((g) => g.querySelector('[data-part]')?.getAttribute('data-part'))).toEqual(['p1']);
    expect(badges(unchanged[0])).toEqual([]);
  });

  test('the written change list says each change in words', () => {
    const { getByRole } = drawn(board, patch);
    expect(
      within(getByRole('list'))
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual([
      'Removed ramp p2 at E2.',
      'Replaced catapult p3 at F6 with catapult p5 at F6 facing east, power 4.',
      'Moved fan p4 from H4 to H3.',
    ]);
  });
});

test('an op the machine skipped is not drawn or written', () => {
  // p1 is already on the board, so applyPatch skips the add and the board is unchanged.
  const reused = Patch.parse([
    { op: 'add', part: { id: 'p1', kind: 'fan', cell: 'K2', dir: 'west', power: 1 } },
  ]);
  const { container } = drawn(board, reused);
  expect(group(container, 'unchanged')).toHaveLength(board.parts.length);
  expect(container.querySelectorAll('[data-badge]')).toHaveLength(0);
  expect(container.querySelectorAll('li')).toHaveLength(0);
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
