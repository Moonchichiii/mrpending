import type { Blueprint, Cell, Part, SimEvent } from '@pending/contract';
import { assertNever } from '../../../shared/assertNever';

// ARCHITECTURE section 3: viewBox 0 0 720 440, grid origin (36, 28), cell 56.
export const BOARD = {
  width: 720,
  height: 440,
  x: 36,
  y: 28,
  cell: 56,
  columns: 'ABCDEFGHIJKL',
  rows: 7,
} as const;
export const HOPPER: Cell = 'A1';
export const BUTTON: Cell = 'L7';

export type Point = { x: number; y: number };
export type Terminal = Extract<SimEvent, { type: 'ball.lost' | 'ball.stopped' | 'impulse.lost' }>['type'];
export type PartView = { part: Part; at: Point; fallen: number[]; wind: Point[]; active: boolean };
export type Segment = { from: Point; to: Point; arc: boolean };
export type Failure = { cell: Cell; at: Point; event: Terminal };
export type Frame = {
  parts: PartView[];
  ball: Point;
  trail: Segment[];
  pressed: boolean;
  failure: Failure | undefined;
};

// Cell (c, r), both counted from zero, centres at (64 + 56c, 56 + 56r).
export const centre = (cell: Cell): Point => ({
  x: BOARD.x + BOARD.cell / 2 + BOARD.cell * BOARD.columns.indexOf(cell.charAt(0)),
  y: BOARD.y + BOARD.cell / 2 + BOARD.cell * (Number(cell.slice(1)) - 1),
});

// `n` cells in a line from `start` steps past `cell`, each step `dc` columns and `dr` rows; off-board cells dropped.
function line(cell: Cell, n: number, dc: number, dr: number, start = 0): Cell[] {
  const c = BOARD.columns.indexOf(cell.charAt(0));
  const r = Number(cell.slice(1));
  return Array.from({ length: n }, (_, i) => ({ c: c + (start + i) * dc, r: r + (start + i) * dr }))
    .filter(({ c, r }) => c >= 0 && c < BOARD.columns.length && r >= 1 && r <= BOARD.rows)
    .map(({ c, r }) => `${BOARD.columns.charAt(c)}${r}`);
}

// A fan's wind, MACHINE-RULES section 2: the next `power` cells toward `dir` in its row.
export function windCells(part: Part): Cell[] {
  if (part.kind !== 'fan') return [];
  return line(part.cell, part.power, part.dir === 'east' ? 1 : -1, 0, 1);
}

// The cells a part occupies (MACHINE-RULES section 2), used only to say which part holds the ball.
function footprint(part: Part): Cell[] {
  const dc = part.dir === 'east' ? 1 : -1;
  switch (part.kind) {
    case 'conveyor':
    case 'dominoes':
      return line(part.cell, part.length, dc, 0);
    case 'ramp':
      return line(part.cell, part.length, dc, 1);
    case 'seesaw':
      return line(part.cell, 3, 1, 0, -1);
    case 'catapult':
    case 'fan':
      return [part.cell];
    default:
      return assertNever(part);
  }
}

// The board at `step`: parts from the blueprint, the ball, its trail, the fallen dominoes and the failure from the
// events up to it. Before the first event the ball waits in the hopper and nothing else is drawn.
export function frame(blueprint: Blueprint, events: SimEvent[], step: number): Frame {
  const fallen = new Map<string, number[]>();
  const trail: Segment[] = [];
  // Like the simulator, a part standing in a cell takes precedence over wind blowing through it.
  const holding = (cell: Cell) =>
    (
      blueprint.parts.find((p) => footprint(p).includes(cell)) ??
      blueprint.parts.find((p) => windCells(p).includes(cell))
    )?.id;
  let ball = centre(HOPPER);
  let active: string | undefined;
  let pressed = false;
  let failure: Failure | undefined;
  for (const event of events) {
    if (event.step > step) break;
    switch (event.type) {
      case 'ball.released':
        ball = centre(event.cell);
        trail.push({ from: centre(HOPPER), to: ball, arc: false });
        active = holding(event.cell);
        break;
      case 'ball.moved':
        ball = centre(event.to);
        trail.push({ from: centre(event.from), to: ball, arc: false });
        active = holding(event.to);
        break;
      case 'ball.launched':
        ball = centre(event.to);
        trail.push({ from: centre(event.from), to: ball, arc: true });
        active = event.part;
        break;
      case 'domino.fell':
        fallen.set(event.part, [...(fallen.get(event.part) ?? []), event.index]);
        active = event.part;
        break;
      case 'button.pressed':
        pressed = true;
        if (event.by === 'ball') ball = centre(BUTTON);
        break;
      case 'ball.lost':
      case 'ball.stopped':
      case 'impulse.lost':
        failure = { cell: event.cell, at: centre(event.cell), event: event.type };
        break;
      default:
        assertNever(event);
    }
  }
  const parts = blueprint.parts.map((part) => ({
    part,
    at: centre(part.cell),
    fallen: fallen.get(part.id) ?? [],
    wind: windCells(part).map(centre),
    active: part.id === active,
  }));
  return { parts, ball, trail, pressed, failure };
}

export const lastStep = (events: SimEvent[]): number => events.at(-1)?.step ?? 0;
