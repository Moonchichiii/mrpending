import type { Attempt } from '@pending/contract';
import { Board, Correction, Minutes, lastStep } from '../board';
import styles from './BuildDesk.module.css';

// The attempt on the board at `step` (its final frame by default), its minutes, and the correction that produced it.
// `pressedAt` is the press clock's start, which the board plays its press sequence on.
export function Trial({
  attempts,
  attempt,
  step = attempt ? lastStep(attempt.events) : 0,
  stepMs,
  pressedAt,
  take,
}: {
  attempts: Attempt[];
  attempt: Attempt | undefined;
  step?: number | undefined;
  stepMs?: number | undefined;
  pressedAt?: number | undefined;
  take: number;
}) {
  if (!attempt) return null;
  const previous = attempts.find((a) => a.n === attempt.n - 1);
  return (
    <>
      {attempt.patch && previous && (
        <Correction n={attempt.n} previous={previous.blueprint} current={attempt.blueprint} />
      )}
      <figure className={styles.trial}>
        {/* Keyed by replay and trial, so a replay or a new attempt starts on a fresh board instead of animating out of the last one. */}
        <Board
          key={`${take}-${attempt.n}`}
          blueprint={attempt.blueprint}
          events={attempt.events}
          step={step}
          stepMs={stepMs}
          pressedAt={pressedAt}
        />
        <figcaption>Trial {attempt.n}</figcaption>
      </figure>
      <Minutes n={attempt.n} events={attempt.events} step={step} />
    </>
  );
}
