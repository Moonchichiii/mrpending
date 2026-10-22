import type { Cell, Part, SimEvent } from '@pending/contract';

export const COLUMNS = 'ABCDEFGHIJKL';
export const ROWS = 7;
export const HOPPER = 'A1';
export const BUTTON = 'L7';

// A position that may lie off the board, so a footprint can be measured before its cells are named.
export type Point = { col: number; row: number };
export type Edge = Extract<SimEvent, { type: 'ball.lost' }>['edge'];

export const toPoint = (cell: Cell): Point => ({
  col: COLUMNS.indexOf(cell.charAt(0)),
  row: Number(cell.slice(1)),
});
export const toCell = (p: Point): Cell => `${COLUMNS.charAt(p.col)}${p.row}`;
export const onBoard = (p: Point): boolean =>
  p.col >= 0 && p.col < COLUMNS.length && p.row >= 1 && p.row <= ROWS;

const run = (from: Point, n: number, col: number, row: number): Point[] =>
  Array.from({ length: n }, (_, i) => ({ col: from.col + i * col, row: from.row + i * row }));

export const sign = (part: Part): number => (part.dir === 'east' ? 1 : -1);

// The side of the board a position beyond it lies on; columns win over rows at a corner.
export function edge(p: Point): Edge {
  if (p.col < 0) return 'west';
  if (p.col >= COLUMNS.length) return 'east';
  return p.row > ROWS ? 'bottom' : 'top';
}

// The cells a part occupies (MACHINE-RULES section 2); parameter ranges live in the contract's Part schema.
export function footprint(part: Part): Point[] {
  const at = toPoint(part.cell);
  switch (part.kind) {
    case 'conveyor':
    case 'dominoes':
      return run(at, part.length, sign(part), 0);
    case 'ramp':
      return run(at, part.length, sign(part), 1);
    case 'seesaw':
      return run({ col: at.col - 1, row: at.row }, 3, 1, 0);
    case 'catapult':
    case 'fan':
      return [at];
  }
}

// A fan's wind: the next `power` cells toward `dir` in its row; other kinds have none.
export function wind(part: Part): Point[] {
  if (part.kind !== 'fan') return [];
  const at = toPoint(part.cell);
  return run({ col: at.col + sign(part), row: at.row }, part.power, sign(part), 0);
}
