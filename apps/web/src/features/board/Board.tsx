import type { Blueprint, SimEvent } from '@pending/contract';
import { useId } from 'react';
import type { Segment } from './model/frame';
import { BOARD, BUTTON, HOPPER, centre, frame, lastStep } from './model/frame';
import { Ball, Button, Hopper, PartSprite } from './Sprites';
import styles from './Board.module.css';

const right = BOARD.x + BOARD.cell * BOARD.columns.length;
const bottom = BOARD.y + BOARD.cell * BOARD.rows;
const columns = BOARD.columns.split('');
const rows = Array.from({ length: BOARD.rows }, (_, r) => r + 1);

// A launch is an instant arc (MACHINE-RULES section 2), drawn as a curve rising above both ends.
const path = ({ from, to, arc }: Segment) =>
  arc
    ? `M ${from.x} ${from.y} Q ${(from.x + to.x) / 2} ${Math.min(from.y, to.y) - BOARD.cell * 1.5} ${to.x} ${to.y}`
    : `M ${from.x} ${from.y} L ${to.x} ${to.y}`;

// The static final frame: no animation yet, which is also the reduced-motion view.
export function Board({ blueprint, events }: { blueprint: Blueprint; events: SimEvent[] }) {
  const id = useId();
  const { parts, ball, trail, pressed } = frame(blueprint, events, lastStep(events));
  const description = [
    `${parts.length} parts: ${parts.map(({ part }) => `${part.kind} at ${part.cell} facing ${part.dir}`).join(', ')}.`,
    pressed ? 'The button is pressed.' : 'The button is not pressed.',
  ].join(' ');
  return (
    <svg
      className={styles.board}
      viewBox={`0 0 ${BOARD.width} ${BOARD.height}`}
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- an inline SVG cannot be an <img>; role img names it
      role="img"
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-desc`}
    >
      <title id={`${id}-title`}>{blueprint.title}</title>
      <desc id={`${id}-desc`}>{description}</desc>
      <rect className={styles.sheet} width={BOARD.width} height={BOARD.height} />
      <g className={styles.grid}>
        {Array.from({ length: BOARD.columns.length + 1 }, (_, c) => (
          <line
            key={`c${c}`}
            x1={BOARD.x + BOARD.cell * c}
            y1={BOARD.y}
            x2={BOARD.x + BOARD.cell * c}
            y2={bottom}
          />
        ))}
        {Array.from({ length: BOARD.rows + 1 }, (_, r) => (
          <line
            key={`r${r}`}
            x1={BOARD.x}
            y1={BOARD.y + BOARD.cell * r}
            x2={right}
            y2={BOARD.y + BOARD.cell * r}
          />
        ))}
      </g>
      <g className={styles.labels}>
        {columns.map((letter) => (
          <text key={letter} x={centre(`${letter}1`).x} y={BOARD.y - 8}>
            {letter}
          </text>
        ))}
        {rows.map((row) => (
          <text key={row} x={BOARD.x / 2} y={centre(`A${row}`).y + 5}>
            {row}
          </text>
        ))}
      </g>
      <Hopper at={centre(HOPPER)} />
      <Button at={centre(BUTTON)} pressed={pressed} />
      {parts.map((view) => (
        <PartSprite key={view.part.id} view={view} />
      ))}
      <g className={styles.trail} data-trail>
        {trail.map((segment, i) => (
          <path key={i} d={path(segment)} />
        ))}
      </g>
      <Ball at={ball} />
    </svg>
  );
}
