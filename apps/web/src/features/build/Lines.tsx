import type { Line } from '@pending/contract';
import styles from './BuildDesk.module.css';

// Mr. Pending's lines said so far, announced politely as they arrive; a model memo is shown under a memo label.
export function Lines({ lines }: { lines: Line[] }) {
  return (
    <ol className={styles.lines} aria-live="polite" aria-label="Mr. Pending">
      {lines.map((line) => (
        <li key={line.id} data-mood={line.mood}>
          {line.source === 'model' && <span className={styles.memo}>Memo: </span>}
          {line.text}
        </li>
      ))}
    </ol>
  );
}
