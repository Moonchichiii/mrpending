import type { ReactNode } from 'react';
import { useId } from 'react';
import { BOARD, BUTTON, HOPPER, centre } from './model/frame';
import { Button, Hopper } from './Sprites';
import styles from './Board.module.css';

const right = BOARD.x + BOARD.cell * BOARD.columns.length;
const bottom = BOARD.y + BOARD.cell * BOARD.rows;
const columns = BOARD.columns.split('');
const rows = Array.from({ length: BOARD.rows }, (_, r) => r + 1);

// The navy sheet every board view shares: grid, grid letters, the hopper and the button, then the view's own drawing.
export function Sheet({
  title,
  description,
  pressed,
  stepMs,
  children,
}: {
  title: string;
  description: string;
  pressed: boolean;
  stepMs?: number | undefined;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <svg
      className={styles.board}
      viewBox={`0 0 ${BOARD.width} ${BOARD.height}`}
      data-pace={stepMs}
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- an inline SVG cannot be an <img>; role img names it
      role="img"
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-desc`}
    >
      <title id={`${id}-title`}>{title}</title>
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
      <g className={styles.labels} data-grid-labels>
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
      {children}
    </svg>
  );
}
