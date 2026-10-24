import type { Blueprint, Part } from '@pending/contract';
import type { ReactNode } from 'react';
import { assertNever } from '../../shared/assertNever';
import type { Change } from './model/diff';
import { diff } from './model/diff';
import type { PartView } from './model/frame';
import { centre, windCells } from './model/frame';
import { Badge, PartSprite } from './Sprites';
import styles from './Board.module.css';

const view = (part: Part): PartView => ({
  part,
  at: centre(part.cell),
  fallen: [],
  wind: windCells(part).map(centre),
  active: false,
});

function Removed({ part, children }: { part: Part; children?: ReactNode }) {
  const { x, y } = centre(part.cell);
  return (
    <>
      <PartSprite view={view(part)} className={styles.removed} />
      <path
        className={styles.cross}
        d={`M ${x - 16} ${y - 16} L ${x + 16} ${y + 16} M ${x + 16} ${y - 16} L ${x - 16} ${y + 16}`}
      />
      {children}
    </>
  );
}

const Halo = ({ part }: { part: Part }) => (
  <circle className={styles.added} cx={centre(part.cell).x} cy={centre(part.cell).y} r={32} />
);

// The trial draws the parts that stand, so a change is drawn only as its marks: what went, and where the new parts are.
function Marks({ change }: { change: Change }) {
  switch (change.kind) {
    case 'unchanged':
      return null;
    case 'removed':
      return (
        <Removed part={change.part}>
          <Badge at={centre(change.part.cell)} sign="−" dx={0} />
        </Removed>
      );
    case 'added':
      return (
        <>
          <Halo part={change.part} />
          <Badge at={centre(change.part.cell)} sign="+" dx={0} />
        </>
      );
    case 'moved': {
      const from = centre(change.from);
      const to = centre(change.part.cell);
      // The arrowhead stops short of the new anchor, its two barbs 10 px back along the move.
      const length = Math.hypot(to.x - from.x, to.y - from.y);
      const [ux, uy] = [(to.x - from.x) / length, (to.y - from.y) / length];
      const tip = { x: to.x - ux * 30, y: to.y - uy * 30 };
      const barb = (side: number) => `${tip.x - ux * 10 + uy * 7 * side} ${tip.y - uy * 10 - ux * 7 * side}`;
      return (
        <>
          <path
            className={styles.moveArrow}
            d={`M ${from.x} ${from.y} L ${tip.x} ${tip.y} M ${barb(1)} L ${tip.x} ${tip.y} L ${barb(-1)}`}
          />
          <text className={styles.moveLabel} x={(from.x + to.x) / 2} y={(from.y + to.y) / 2 - 10}>
            from {change.from}
          </text>
        </>
      );
    }
    case 'replaced':
      return (
        <Removed part={change.removed}>
          <Halo part={change.added} />
          <Badge at={centre(change.added.cell)} sign="−" dx={-14} />
          <Badge at={centre(change.added.cell)} sign="+" dx={14} />
        </Removed>
      );
    default:
      return assertNever(change);
  }
}

// The repair diff on the board of the trial it produced: the previous board's changes marked in symbols over the parts.
export function Correction({ previous, current }: { previous: Blueprint; current: Blueprint }) {
  return (
    <g data-correction>
      {diff(previous, current).map((change) => (
        <g key={change.kind === 'replaced' ? change.removed.id : change.part.id} data-change={change.kind}>
          <Marks change={change} />
        </g>
      ))}
    </g>
  );
}
