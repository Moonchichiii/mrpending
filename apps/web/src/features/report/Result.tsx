import type { ReactNode } from 'react';
import styles from './Report.module.css';

// The paper pinned under the board's steps: a red PENDING stamp until the simulator's verdict is in, PRESSED in green
// once the button is pressed, and one or two plain sentences under it. The board's status region announces the
// phase, so this paper is not a live region; `children` holds an alert about the ending.
export function Result({
  stamp,
  text,
  children,
}: {
  stamp: 'PENDING' | 'PRESSED';
  text: string;
  children?: ReactNode;
}) {
  return (
    <section className={styles.result} aria-label="Simulation result">
      <svg className={styles.clip} viewBox="0 0 20 44" aria-hidden="true">
        <path d="M6 30V9a5 5 0 0 1 10 0v24a7 7 0 0 1-14 0V12" />
      </svg>
      <h3 className={styles.resultTitle}>Simulation result</h3>
      <p className={stamp === 'PRESSED' ? styles.pressed : styles.pending} data-stamp={stamp}>
        {stamp}
      </p>
      <p className={styles.text}>{text}</p>
      {children}
    </section>
  );
}
