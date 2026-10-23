import { Blueprint, SimEvent } from '@pending/contract';
import { render } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { Board } from './Board';
import { centre, frame, lastStep } from './model/frame';

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
// The ball moves by a CSS transform so that it transitions between cells.
const ballAt = (container: Element) => container.querySelector<SVGGElement>('[data-ball]')?.style.transform;
const ballIn = (cell: string) => `translate(${at(cell).x}px, ${at(cell).y}px)`;

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
    expect(ballAt(container)).toBe(ballIn(final.ball));
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
  expect(ballAt(container)).toBe(ballIn('A1'));
});

describe('mechanisms are drawn from their simulator semantics', () => {
  test('a fan draws one wind arrow in each cell of its power, pointing its way', () => {
    const { container } = draw('seesaw');
    const wind = [...container.querySelectorAll('[data-wind="p3"] path')];
    expect(wind).toHaveLength(2);
    // Fan p3 at G4 east, power 2: wind in H4 and I4, each arrow running west to east through its cell centre.
    expect(wind.map((p) => p.getAttribute('d'))).toEqual(
      ['H4', 'I4'].map(
        (c) =>
          `M ${at(c).x - 18} ${at(c).y} L ${at(c).x + 14} ${at(c).y} M ${at(c).x + 6} ${at(c).y - 8} L ${at(c).x + 14} ${at(c).y} L ${at(c).x + 6} ${at(c).y + 8}`,
      ),
    );
  });

  test('wind beyond the edge of the board is not drawn', () => {
    const blueprint = Blueprint.parse({
      title: 'Edge',
      parts: [{ id: 'p1', kind: 'fan', cell: 'K3', dir: 'east', power: 4 }],
    });
    const { container } = render(<Board blueprint={blueprint} events={[]} />);
    expect(container.querySelectorAll('[data-wind="p1"] path')).toHaveLength(1);
  });

  test('conveyors and ramps carry direction chevrons along their length; west mirrors them', () => {
    const { container } = draw('pressed');
    const conveyor = container.querySelector('[data-part="p1"]');
    const ramp = container.querySelector('[data-part="p2"]');
    expect(conveyor?.getAttribute('data-dir')).toBe('east');
    // Both copies (halo and ink) carry the chevrons: conveyor A2 length 4 has 3 gaps, ramp E2 length 4 has 4 cells.
    expect(conveyor?.querySelectorAll('[data-direction]')).toHaveLength(6);
    expect(ramp?.querySelectorAll('[data-direction]')).toHaveLength(8);
  });

  test('a seesaw shows its pivot at the anchor, its load end opposite dir and its launch end toward dir', () => {
    const { container } = draw('seesaw');
    const seesaw = container.querySelector('[data-part="p2"]');
    expect(seesaw?.getAttribute('transform')).toBe(translate('E6'));
    const load = seesaw?.querySelector('g:not([aria-hidden]) [data-end="load"]')?.getAttribute('d') ?? '';
    const launch = seesaw?.querySelector('g:not([aria-hidden]) [data-end="launch"]')?.getAttribute('d') ?? '';
    // Drawn facing east: the load end sits one cell west of the pivot (D6), the launch end one cell east (F6).
    expect(load).toMatch(/^M -64 .* L -48 /);
    expect(launch).toMatch(/^M 48 .* L 64 /);
  });

  test('dominoes fall one per domino.fell event, never ahead of it', () => {
    const { blueprint, events } = fixture('seesaw');
    for (let step = 0; step <= 15; step += 1) {
      const fell = events.filter((e) => e.type === 'domino.fell' && e.step <= step).length;
      const { container } = render(<Board blueprint={blueprint} events={events} step={step} />);
      expect(container.querySelectorAll('g:not([aria-hidden]) > [data-fallen="true"]')).toHaveLength(fell);
    }
  });

  test('the arc endpoints equal the ball.launched cells', () => {
    for (const { blueprint, events } of fixtures) {
      const launches = events.flatMap((e) => (e.type === 'ball.launched' ? [e] : []));
      const { container } = render(<Board blueprint={blueprint} events={events} />);
      const arcs = [...container.querySelectorAll('[data-trail] [data-arc="true"]')];
      expect(arcs).toHaveLength(launches.length);
      arcs.forEach((arc, i) => {
        const launch = launches[i];
        if (!launch) throw new Error('more arcs than launches');
        const d = arc.getAttribute('d') ?? '';
        expect(d.startsWith(`M ${at(launch.from).x} ${at(launch.from).y} Q`)).toBe(true);
        expect(d.endsWith(` ${at(launch.to).x} ${at(launch.to).y}`)).toBe(true);
      });
    }
  });

  test.each([
    ['lost', 'ball.lost', 'L3'],
    ['stalled', 'ball.stopped', 'E7'],
    ['catapult', 'ball.stopped', 'H4'],
  ])('%s: the terminal event names the ringed failure cell', (name, event, cell) => {
    const { container } = draw(name);
    const ring = container.querySelector('[data-failure]');
    expect(ring?.getAttribute('data-failure')).toBe(event);
    expect(ring?.getAttribute('data-cell')).toBe(cell);
    expect(ring?.getAttribute('transform')).toBe(translate(cell));
    expect(ring?.textContent).toBe(event);
  });

  test('no ring before the terminal event and none on a pressed run', () => {
    const { blueprint, events } = fixture('lost');
    const before = lastStep(events) - 1;
    expect(frame(blueprint, events, before).failure).toBeUndefined();
    expect(draw('pressed').container.querySelector('[data-failure]')).toBeNull();
  });

  test('the active part is the one the events say holds or moves the ball', () => {
    const { blueprint, events } = fixture('seesaw');
    const active = (step: number) => frame(blueprint, events, step).parts.find((p) => p.active)?.part.id;
    expect(active(0)).toBeUndefined();
    expect(active(2)).toBe('p1'); // on the ramp
    expect(active(5)).toBeUndefined(); // falling through air
    expect(active(7)).toBe('p2'); // the seesaw launched it
    expect(active(8)).toBe('p3'); // in the fan's wind
    expect(active(14)).toBe('p4'); // a domino fell
    const { container } = render(<Board blueprint={blueprint} events={events} step={7} />);
    expect(
      [...container.querySelectorAll('[data-label][data-active="true"]')].map((l) => l.textContent),
    ).toEqual(['seesaw']);
    expect(container.querySelectorAll('[data-label]')).toHaveLength(blueprint.parts.length);
  });

  test('a part in a cell outranks fan wind blowing through it, whatever the blueprint order', () => {
    // Fan p1 at A3 blows east over B3 to E3; conveyor p2 sits on C3 to D3 inside that wind.
    const blueprint = Blueprint.parse({
      title: 'Windswept belt',
      parts: [
        { id: 'p1', kind: 'fan', cell: 'A3', dir: 'east', power: 4 },
        { id: 'p2', kind: 'conveyor', cell: 'C3', dir: 'east', length: 2 },
      ],
    });
    // A hand-written log: frame folds events, it does not simulate, so only the cells named matter here.
    const events = SimEvent.array().parse([
      { type: 'ball.released', step: 1, cell: 'A2' },
      { type: 'ball.moved', step: 2, from: 'A2', to: 'B2', by: 'gravity' },
      { type: 'ball.moved', step: 3, from: 'B2', to: 'B3', by: 'gravity' },
      { type: 'ball.moved', step: 4, from: 'B3', to: 'C3', by: 'fan' },
    ]);
    const active = (step: number) => frame(blueprint, events, step).parts.find((p) => p.active)?.part.id;
    expect(active(3)).toBe('p1');
    expect(active(4)).toBe('p2');
  });
});

test('no effect without an event: an empty log draws the parts only', () => {
  for (const { blueprint } of fixtures) {
    const { container } = render(<Board blueprint={blueprint} events={[]} />);
    expect(container.querySelectorAll('[data-part]')).toHaveLength(blueprint.parts.length);
    expect(container.querySelectorAll('[data-trail] path')).toHaveLength(0);
    expect(container.querySelector('[data-failure]')).toBeNull();
    expect(container.querySelectorAll('[data-fallen="true"]')).toHaveLength(0);
    expect(container.querySelectorAll('[data-active="true"]')).toHaveLength(0);
    expect(container.querySelector('[data-button]')?.getAttribute('data-pressed')).toBe('false');
    expect(ballAt(container)).toBe(ballIn('A1'));
  }
});

test.each([240, 120, 40])(
  'the board carries its step duration of %i ms for the CSS transitions',
  (stepMs) => {
    const { blueprint, events } = fixture('pressed');
    const { container } = render(<Board blueprint={blueprint} events={events} step={3} stepMs={stepMs} />);
    expect(container.querySelector('svg')?.getAttribute('data-pace')).toBe(String(stepMs));
  },
);
