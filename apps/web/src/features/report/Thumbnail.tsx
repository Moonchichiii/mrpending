import type { Blueprint, SimEvent } from '@pending/contract';
import { BOARD, BUTTON, HOPPER, centre, frame, lastStep } from '../board';

// Presentation attributes rather than CSS classes, so the drawing survives rasterisation outside the page's styles.
const INK = '#1f1b2e';
const PAPER = '#fff8e6';

// The final frame of the final attempt, drawn small: parts at their cells, the ball's trail, the button and any failure.
export function Thumbnail({
  blueprint,
  events,
  x,
  y,
  width,
}: {
  blueprint: Blueprint;
  events: SimEvent[];
  x: number;
  y: number;
  width: number;
}) {
  const { parts, ball, trail, pressed, failure } = frame(blueprint, events, lastStep(events));
  const hopper = centre(HOPPER);
  const button = centre(BUTTON);
  return (
    <svg
      x={x}
      y={y}
      width={width}
      height={(width * BOARD.height) / BOARD.width}
      viewBox={`0 0 ${BOARD.width} ${BOARD.height}`}
      data-thumbnail
    >
      <rect width={BOARD.width} height={BOARD.height} rx={12} fill="#2446b8" stroke={INK} strokeWidth={6} />
      <path
        d={trail.map(({ from, to }) => `M ${from.x} ${from.y} L ${to.x} ${to.y}`).join(' ')}
        fill="none"
        stroke={PAPER}
        strokeWidth={5}
        strokeLinecap="round"
        strokeDasharray="1 12"
      />
      <rect
        x={hopper.x - 20}
        y={hopper.y - 20}
        width={40}
        height={40}
        rx={6}
        fill={PAPER}
        stroke={INK}
        strokeWidth={4}
      />
      {parts.map(({ part, at }) => (
        <rect
          key={part.id}
          data-part={part.id}
          x={at.x - 22}
          y={at.y - 22}
          width={44}
          height={44}
          rx={8}
          fill="#f2a33a"
          stroke={INK}
          strokeWidth={4}
        />
      ))}
      <path
        d={`M ${button.x - 20} ${button.y + 16} A 20 20 0 0 1 ${button.x + 20} ${button.y + 16} Z`}
        fill={pressed ? '#1f4fd1' : '#2f6bff'}
        stroke={PAPER}
        strokeWidth={4}
        data-pressed={pressed}
      />
      {failure && (
        <circle
          data-failure={failure.cell}
          cx={failure.at.x}
          cy={failure.at.y}
          r={30}
          fill="none"
          stroke="#ff5a4e"
          strokeWidth={6}
        />
      )}
      <circle
        data-ball={`${ball.x} ${ball.y}`}
        cx={ball.x}
        cy={ball.y}
        r={12}
        fill="#ff5a4e"
        stroke={INK}
        strokeWidth={4}
      />
    </svg>
  );
}
