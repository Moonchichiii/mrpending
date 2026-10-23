import type { Blueprint, SimEvent } from '@pending/contract';
import type { Segment } from './model/frame';
import { BOARD, frame, lastStep } from './model/frame';
import { Sheet } from './Sheet';
import { Ball, FailureRing, PartLabel, PartSprite, Press } from './Sprites';
import styles from './Board.module.css';

// A launch is an instant arc (MACHINE-RULES section 2), drawn as a curve rising above both ends.
const path = ({ from, to, arc }: Segment) =>
  arc
    ? `M ${from.x} ${from.y} Q ${(from.x + to.x) / 2} ${Math.min(from.y, to.y) - BOARD.cell * 1.5} ${to.x} ${to.y}`
    : `M ${from.x} ${from.y} L ${to.x} ${to.y}`;

// The board at `step` (the final frame by default); the ball and the dominoes move by CSS transitions of `stepMs`.
// Only the step that reaches button.pressed draws the press (character sheet section 6); `pressedAt`, the
// performance.now() of that tick, plays it as the 2.2 s sequence, and without it the press is drawn at rest.
export function Board({
  blueprint,
  events,
  step = lastStep(events),
  stepMs,
  pressedAt,
}: {
  blueprint: Blueprint;
  events: SimEvent[];
  step?: number | undefined;
  stepMs?: number | undefined;
  pressedAt?: number | undefined;
}) {
  const { parts, ball, trail, pressed, failure } = frame(blueprint, events, step);
  const description = [
    `${parts.length} parts: ${parts.map(({ part }) => `${part.kind} at ${part.cell} facing ${part.dir}`).join(', ')}.`,
    failure ? `${failure.event} at ${failure.cell}.` : '',
    pressed ? 'The button is pressed.' : 'The button is not pressed.',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <Sheet
      title={blueprint.title}
      description={description}
      pressed={pressed}
      pressedAt={pressedAt}
      stepMs={stepMs}
    >
      {parts.map((view) => (
        <PartSprite key={view.part.id} view={view} />
      ))}
      <g className={styles.trail} data-trail>
        {trail.map((segment, i) => (
          <path key={i} d={path(segment)} data-arc={segment.arc} />
        ))}
      </g>
      <g className={styles.partLabels}>
        {parts.map((view) => (
          <PartLabel key={view.part.id} view={view} />
        ))}
      </g>
      {failure && <FailureRing failure={failure} />}
      <Ball at={ball} />
      {pressed && <Press />}
    </Sheet>
  );
}
