import type { Attempt, Line } from '@pending/contract';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { Board, Minutes, lastStep, written } from '../board';
import { Lines } from './Lines';
import styles from './BoardPanel.module.css';

const EMPTY = { title: 'The empty board', parts: [] };
const CAPTION = 'The ridiculous machinery appears here.';

// The one board, mounted idle and kept through drafting, every trial, its failure, the repair and every retry. The
// trial selector shows any trial the playhead has reached; it follows the playhead until another is chosen, and a new
// `run` (a replay, a new build) follows it again. The repair is marked on the board of the trial it produced. The
// minutes and the lines said are folded away under it, and `overlay` (the verdict, an error) sits on top of it.
export function BoardPanel({
  header,
  attempts,
  playing,
  run,
  stepMs,
  pressedAt,
  caption = CAPTION,
  lines,
  controls,
  overlay,
}: {
  header: string | undefined;
  attempts: Attempt[];
  playing: { attempt: Attempt; step: number } | undefined;
  run: string;
  stepMs?: number | undefined;
  pressedAt?: number | undefined;
  caption?: string | undefined;
  lines: Line[];
  controls?: ReactNode;
  overlay?: ReactNode;
}) {
  const [chosen, choose] = useState<{ run: string; n: number }>();
  const reached = playing === undefined ? [] : attempts.filter((a) => a.n <= playing.attempt.n);
  const picked = chosen?.run === run ? reached.find((a) => a.n === chosen.n) : undefined;
  const shown = picked ?? playing?.attempt;
  const live = shown !== undefined && shown === playing?.attempt;
  const step = live ? playing.step : shown && lastStep(shown.events);
  const previous = shown?.patch && attempts.find((a) => a.n === shown.n - 1);

  return (
    <section className={styles.panel} aria-label="The board">
      <div className={styles.toolbar}>
        <p className={styles.header}>{header}</p>
        {/* In every phase, so the toolbar keeps its size; a trial joins it when the playhead reaches it. */}
        <fieldset className={styles.trials}>
          <legend className={styles.legend}>Trials</legend>
          <span aria-hidden="true">{reached.length === 0 ? 'No trials yet' : 'Trial'}</span>
          {reached.map((attempt) => (
            <button
              key={attempt.n}
              type="button"
              className={styles.trial}
              aria-label={`Trial ${attempt.n}`}
              aria-pressed={attempt === shown}
              onClick={() => choose({ run, n: attempt.n })}
            >
              {attempt.n}
            </button>
          ))}
        </fieldset>
        {controls}
      </div>
      <div className={styles.view}>
        <div className={styles.sheet}>
          {shown === undefined ? (
            <Board blueprint={EMPTY} events={[]} />
          ) : (
            <Board
              blueprint={shown.blueprint}
              events={shown.events}
              step={step}
              stepMs={live ? stepMs : undefined}
              pressedAt={live ? pressedAt : undefined}
              previous={previous?.blueprint}
              run={`${run}:${shown.n}`}
            />
          )}
          {shown === undefined && overlay === undefined && <p className={styles.caption}>{caption}</p>}
          {overlay !== undefined && <div className={styles.overlay}>{overlay}</div>}
        </div>
      </div>
      <div className={styles.foot}>
        <p className={styles.level}>Gemma designs → Simulator tests → Gemma repairs</p>
        <details className={styles.notes}>
          <summary className={styles.summary}>Minutes and lines</summary>
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
        </details>
      </div>
    </section>
  );
}
