import type { Build, Line } from '@pending/contract';
import { Minutes, written } from '../board';
import { EngineeringReport } from '../report';
import { Lines } from './Lines';
import type { Trial } from './useTrial';
import styles from './BoardPanel.module.css';

// The first closed section under the board: Mr. Pending's lines, the correction and the minutes of the trial on the
// board, and once a build has ended its Engineering Report with Save as image.
export function MinutesFold({
  trial,
  lines,
  ended,
}: {
  trial: Trial;
  lines: Line[];
  ended?: Build | undefined;
}) {
  const { shown, step, previous } = trial;
  return (
    <details className={styles.fold}>
      <summary className={styles.summary}>
        <h2 className={styles.foldTitle}>Minutes</h2>
      </summary>
      <div className={styles.foldBody}>
        {/* Intentional internal scrolling: a trial has up to 400 events, so the list scrolls inside its fold. */}
        {/* oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- a scrolling region must be reachable by keyboard */}
        <section className={styles.scroll} aria-label="Minutes and lines" tabIndex={0}>
          <Lines lines={lines} />
          {shown !== undefined && previous !== undefined && (
            <section aria-label={`Correction for trial ${shown.n}`}>
              <h3 className={styles.subhead}>
                Correction {shown.n - 1}, for trial {shown.n}
              </h3>
              <ul className={styles.list}>
                {written(previous.blueprint, shown.blueprint).map((text) => (
                  <li key={text}>{text}</li>
                ))}
              </ul>
            </section>
          )}
          {shown !== undefined && step !== undefined && (
            <Minutes n={shown.n} events={shown.events} step={step} />
          )}
        </section>
        {ended !== undefined && <EngineeringReport build={ended} />}
      </div>
    </details>
  );
}
