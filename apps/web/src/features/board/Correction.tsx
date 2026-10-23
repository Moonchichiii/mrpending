import type { Blueprint, Part } from '@pending/contract';
import type { ReactNode } from 'react';
import { assertNever } from '../../shared/assertNever';
import type { Change } from './model/diff';
import { changeText, diff } from './model/diff';
import type { PartView } from './model/frame';
import { centre, windCells } from './model/frame';
import { Sheet } from './Sheet';
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

function Drawn({ change }: { change: Change }) {
  switch (change.kind) {
    case 'unchanged':
      return <PartSprite view={view(change.part)} className={styles.unchanged} />;
    case 'removed':
      return (
        <Removed part={change.part}>
          <Badge at={centre(change.part.cell)} sign="−" dx={0} />
        </Removed>
      );
    case 'added':
      return (
        <>
          <circle
            className={styles.added}
            cx={centre(change.part.cell).x}
            cy={centre(change.part.cell).y}
            r={32}
          />
          <PartSprite view={view(change.part)} />
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
          <PartSprite view={view(change.part)} />
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
          <circle
            className={styles.added}
            cx={centre(change.added.cell).x}
            cy={centre(change.added.cell).y}
            r={32}
          />
          <PartSprite view={view(change.added)} />
          <Badge at={centre(change.added.cell)} sign="−" dx={-14} />
          <Badge at={centre(change.added.cell)} sign="+" dx={14} />
        </Removed>
      );
    default:
      return assertNever(change);
  }
}

// The repair diff for trial n: the previous board with what its correction changed marked in symbols, and in words.
export function Correction({ n, previous, current }: { n: number; previous: Blueprint; current: Blueprint }) {
  const changes = diff(previous, current);
  const written = changes.flatMap((change) => changeText(change) ?? []);
  return (
    <figure className={styles.correction}>
      <Sheet title={`Correction for trial ${n}`} description={written.join(' ')} pressed={false}>
        {changes.map((change) => (
          <g key={change.kind === 'replaced' ? change.removed.id : change.part.id} data-change={change.kind}>
            <Drawn change={change} />
          </g>
        ))}
      </Sheet>
      <figcaption>
        Correction {n - 1}, for trial {n}:
        <ul className={styles.changes}>
          {written.map((text) => (
            <li key={text}>{text}</li>
          ))}
        </ul>
      </figcaption>
    </figure>
  );
}
