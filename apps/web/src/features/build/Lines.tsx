import type { Attempt, Line } from '@pending/contract';
import { Engineer } from '../engineer';
import type { Phase } from '../engineer';
import { failedOn } from './model/session';
import styles from './BuildDesk.module.css';

// Mr. Pending's lines said so far, announced politely as they arrive; a model memo is shown under a memo label.
// They sit on his line card, whose rig takes its mood from the phase and the latest line, and plays the press when
// the board has reached the button; the held attempts say whether the latest line's attempt really failed.
export function Lines({
  status,
  lines,
  attempts,
  pressed,
}: {
  status: Phase;
  lines: Line[];
  attempts: Attempt[];
  pressed: boolean;
}) {
  const line = lines.at(-1);
  return (
    <Engineer status={status} line={line} failed={failedOn(attempts, line)} pressed={pressed}>
      <ol className={styles.lines} aria-live="polite" aria-label="Mr. Pending">
        {lines.map((line) => (
          <li key={line.id} data-mood={line.mood}>
            {line.source === 'model' && <span className={styles.memo}>Memo: </span>}
            {line.text}
          </li>
        ))}
      </ol>
    </Engineer>
  );
}
