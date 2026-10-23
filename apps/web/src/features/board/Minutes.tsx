import type { SimEvent } from '@pending/contract';
import { minute } from './model/minutes';
import styles from './Board.module.css';

// The text equivalent of the board: one entry per event up to the playhead, in order.
export function Minutes({ n, events, step }: { n: number; events: SimEvent[]; step: number }) {
  const shown = events.filter((event) => event.step <= step);
  return (
    <section className={styles.minutes} aria-label={`Minutes of trial ${n}`}>
      <h3>Minutes of trial {n}</h3>
      {shown.length === 0 ? (
        <p>Nothing has happened yet.</p>
      ) : (
        <ol>
          {shown.map((event, i) => (
            <li key={i}>{minute(event)}</li>
          ))}
        </ol>
      )}
    </section>
  );
}
