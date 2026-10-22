import type { Blueprint, Cell, Part, SimEvent } from '@pending/contract';

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
export type PartView = { part: Part; at: Point; fallen: number[] };
export type Segment = { from: Point; to: Point; arc: boolean };
export type Frame = { parts: PartView[]; ball: Point | undefined; trail: Segment[]; pressed: boolean };

// Cell (c, r), both counted from zero, centres at (64 + 56c, 56 + 56r).
export const centre = (cell: Cell): Point => ({
  x: BOARD.x + BOARD.cell / 2 + BOARD.cell * BOARD.columns.indexOf(cell.charAt(0)),
  y: BOARD.y + BOARD.cell / 2 + BOARD.cell * (Number(cell.slice(1)) - 1),
});

// The board at `step`: parts from the blueprint, the ball, its trail and the fallen dominoes from the events up to it.
export function frame(blueprint: Blueprint, events: SimEvent[], step: number): Frame {
  const fallen = new Map<string, number[]>();
  const trail: Segment[] = [];
  let ball: Point | undefined;
  let pressed = false;
  for (const event of events) {
    if (event.step > step) break;
    switch (event.type) {
      case 'ball.released':
        ball = centre(event.cell);
        trail.push({ from: centre(HOPPER), to: ball, arc: false });
        break;
      case 'ball.moved':
      case 'ball.launched':
        ball = centre(event.to);
        trail.push({ from: centre(event.from), to: ball, arc: event.type === 'ball.launched' });
        break;
      case 'domino.fell':
        fallen.set(event.part, [...(fallen.get(event.part) ?? []), event.index]);
        break;
      case 'button.pressed':
        pressed = true;
        if (event.by === 'ball') ball = centre(BUTTON);
        break;
      case 'ball.lost':
      case 'ball.stopped':
      case 'impulse.lost':
        break;
      default:
        assertNever(event);
    }
  }
  const parts = blueprint.parts.map((part) => ({
    part,
    at: centre(part.cell),
    fallen: fallen.get(part.id) ?? [],
  }));
  return { parts, ball, trail, pressed };
}

export const lastStep = (events: SimEvent[]): number => events.at(-1)?.step ?? 0;

function assertNever(value: never): never {
  throw new Error(`unhandled event ${JSON.stringify(value)}`);
}
