import type { Line } from '@pending/contract';
import { Engineer } from '../engineer';
import type { Phase } from '../engineer';
import styles from './BuildDesk.module.css';

// Mr. Pending's lines said so far, announced politely as they arrive; a model memo is shown under a memo label.
// They sit on his line card, whose rig takes its mood from the phase and the latest line.
export function Lines({ status, lines }: { status: Phase; lines: Line[] }) {
  return (
    <Engineer status={status} line={lines.at(-1)}>
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
