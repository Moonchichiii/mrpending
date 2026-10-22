import { Blueprint, SimEvent } from '@pending/contract';
import { render } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { Board } from './Board';
import { centre, frame } from './model/frame';

// Fixtures are external data: parsed at the boundary, like any record the board will draw.
const blueprints = import.meta.glob<unknown>('../../../../../packages/machine/fixtures/*/blueprint.json', {
  eager: true,
  import: 'default',
});
const eventLogs = import.meta.glob<unknown>('../../../../../packages/machine/fixtures/*/events.json', {
  eager: true,
  import: 'default',
});
const fixtures = Object.entries(blueprints).map(([path, raw]) => ({
  name: path.split('/').at(-2) ?? path,
  blueprint: Blueprint.parse(raw),
  events: SimEvent.array().parse(eventLogs[path.replace('blueprint.json', 'events.json')] ?? []),
}));
const fixture = (name: string) => {
  const found = fixtures.find((f) => f.name === name);
  if (!found) throw new Error(`no fixture ${name}`);
  return found;
};
const draw = (name: string) => {
  const { blueprint, events } = fixture(name);
  return { blueprint, events, container: render(<Board blueprint={blueprint} events={events} />).container };
};

// Cell (c, r) centres at (64 + 56c, 56 + 56r), restated from ARCHITECTURE section 3.
const at = (cell: string) => ({
  x: 64 + 56 * 'ABCDEFGHIJKL'.indexOf(cell.charAt(0)),
  y: 56 + 56 * (Number(cell.slice(1)) - 1),
});
const translate = (cell: string) => `translate(${at(cell).x} ${at(cell).y})`;

// The final frame each fixture must show (MACHINE-RULES section 7).
const finals = {
  pressed: { pressed: true, ball: 'I7', fallen: 3 },
  lost: { pressed: false, ball: 'L3', fallen: 0 },
  repaired: { pressed: true, ball: 'I7', fallen: 3 },
  stalled: { pressed: false, ball: 'E7', fallen: 0 },
  seesaw: { pressed: true, ball: 'J7', fallen: 2 },
  catapult: { pressed: false, ball: 'H4', fallen: 0 },
  'catapult-repaired': { pressed: true, ball: 'K7', fallen: 1 },
  invalid: { pressed: false, ball: 'A1', fallen: 0 },
};

test('cells centre on the 56 px grid from (36, 28)', () => {
  expect(centre('A1')).toEqual({ x: 64, y: 56 });
  expect(centre('E2')).toEqual({ x: 288, y: 112 });
  expect(centre('L7')).toEqual({ x: 680, y: 392 });
});

test('every fixture is covered', () => {
  expect(fixtures.map((f) => f.name).sort()).toEqual(Object.keys(finals).sort());
});

describe.each(Object.entries(finals))('fixture %s', (name, final) => {
  test('fills the 720 x 440 board under its title', () => {
    const { blueprint, container } = draw(name);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('viewBox')).toBe('0 0 720 440');
    expect(svg?.querySelector('title')?.textContent).toBe(blueprint.title);
  });

  test('places every part, the hopper and the button on its cell', () => {
    const { blueprint, container } = draw(name);
    const ids = [...container.querySelectorAll('[data-part]')].map((p) => p.getAttribute('data-part'));
    expect(ids).toEqual(blueprint.parts.map((p) => p.id));
    for (const part of blueprint.parts) {
      const drawn = container.querySelector(`[data-part="${part.id}"]`);
      expect(drawn?.getAttribute('data-kind')).toBe(part.kind);
      expect(drawn?.getAttribute('transform')).toBe(translate(part.cell));
    }
    expect(container.querySelector('[data-hopper]')?.getAttribute('transform')).toBe(translate('A1'));
    expect(container.querySelector('[data-button]')?.getAttribute('transform')).toBe(translate('L7'));
  });

  test('puts a paper halo under every part, the hopper, the button and the ball', () => {
    const { blueprint, container } = draw(name);
    const sprites = container.querySelectorAll('[data-part], [data-hopper], [data-button], [data-ball]');
    expect(sprites).toHaveLength(blueprint.parts.length + 3);
    for (const drawn of sprites) {
      const halo = drawn.querySelector('[aria-hidden="true"]');
      expect(halo?.innerHTML).toBe(halo?.nextElementSibling?.innerHTML);
    }
  });

  test('shows the final frame of the events', () => {
    const { events, container } = draw(name);
    expect(container.querySelector('[data-ball]')?.getAttribute('transform')).toBe(translate(final.ball));
    expect(container.querySelector('[data-button]')?.getAttribute('data-pressed')).toBe(
      String(final.pressed),
    );
    expect(container.querySelectorAll('g:not([aria-hidden]) > [data-fallen="true"]')).toHaveLength(
      final.fallen,
    );
    const travels = events.filter((e) => e.type === 'ball.released' || 'to' in e).length;
    expect(container.querySelectorAll('[data-trail] path')).toHaveLength(travels);
  });
});

test('before any event the ball waits in the hopper', () => {
  const { blueprint, events } = fixture('pressed');
  const view = frame(blueprint, events, 0);
  expect(view.ball).toEqual(at('A1'));
  expect(view.trail).toEqual([]);
  expect(view.pressed).toBe(false);
});

test('a launch is an arc in the trail and the frame stops at the given step', () => {
  const { blueprint, events } = fixture('seesaw');
  const view = frame(blueprint, events, 7);
  expect(view.ball).toEqual(at('H4'));
  expect(view.trail.at(-1)).toEqual({ from: at('D6'), to: at('H4'), arc: true });
  expect(view.pressed).toBe(false);
  expect(view.parts.every((p) => p.fallen.length === 0)).toBe(true);
});

test('a west-facing part is mirrored about its anchor', () => {
  const blueprint = Blueprint.parse({
    title: 'Westward',
    parts: [{ id: 'p1', kind: 'ramp', cell: 'F2', dir: 'west', length: 3 }],
  });
  const { container } = render(<Board blueprint={blueprint} events={[]} />);
  const ramp = container.querySelector('[data-part="p1"]');
  expect(ramp?.getAttribute('transform')).toBe(translate('F2'));
  expect(ramp?.firstElementChild?.getAttribute('transform')).toBe('scale(-1 1)');
  expect(container.querySelector('[data-ball]')?.getAttribute('transform')).toBe(translate('A1'));
});
