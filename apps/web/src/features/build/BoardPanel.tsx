import { MAX_ATTEMPTS } from '@pending/contract';
import type { ReactNode } from 'react';
import { useLayoutEffect, useRef } from 'react';
import { BOARD, Board } from '../board';
import type { Mark, Progress } from './model/progress';
import type { Trial } from './useTrial';
import styles from './BoardPanel.module.css';

const EMPTY = { title: 'The empty board', parts: [] };
const CAPTION = 'The ridiculous machinery appears here.';

// What a mark means in words, so no state rests on the colour or the icon alone.
const SAID: Record<Mark, string> = {
  done: 'done',
  current: 'in progress',
  failed: 'failed',
  pending: 'to do',
  skipped: 'not needed',
};

// The sheet keeps its 720 x 440 shape, centred in the place it is given; the grid under it continues the sheet's cells
// to the edges of that place, so its cell size and origin in pixels are measured whenever the place changes size.
function useGridUnder() {
  const place = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = place.current;
    if (el === null || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      const { clientWidth: width, clientHeight: height } = el;
      const scale = Math.min(width / BOARD.width, height / BOARD.height);
      el.style.setProperty('--cell', `${BOARD.cell * scale}px`);
      el.style.setProperty('--grid-x', `${(width - BOARD.width * scale) / 2 + BOARD.x * scale}px`);
      el.style.setProperty('--grid-y', `${(height - BOARD.height * scale) / 2 + BOARD.y * scale}px`);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return place;
}

// The one engineering board, mounted idle and kept through drafting, every trial, its failure, the repair, every retry
// and the ending. Its header names the model, the trial and a dot per trial (a reached trial's dot shows it on the
// board); the machine fills its middle with the current step and the playback controls under it; the steps and the
// pinned result stand on its right. The repair is marked on the board of the trial it produced, and `overlay` (an
// error) sits on top of the machine.
export function BoardPanel({
  trial,
  progress,
  badge,
  run,
  stepMs,
  pressedAt,
  caption = CAPTION,
  status,
  controls,
  result,
  overlay,
}: {
  trial: Trial;
  progress: Progress;
  badge: ReactNode;
  run: string;
  stepMs?: number | undefined;
  pressedAt?: number | undefined;
  caption?: string | undefined;
  status: ReactNode;
  controls: ReactNode;
  result: ReactNode;
  overlay?: ReactNode;
}) {
  const { reached, shown, live, step, previous, choose } = trial;
  const place = useGridUnder();
  return (
    <section className={styles.panel} aria-label="The board">
      <div className={styles.header}>
        <h2 className={styles.title}>The engineering board</h2>
        {badge}
        <p className={styles.attempt}>
          Attempt {progress.attempt} / {MAX_ATTEMPTS}
        </p>
        {/* Every trial has a dot in every phase, so the header keeps its size; a reached trial's dot is a button. */}
        <fieldset className={styles.trials}>
          <legend className={styles.legend}>Trials</legend>
          {progress.trials.map((mark, i) => {
            const n = i + 1;
            const attempt = reached.find((a) => a.n === n);
            // The outcome is a glyph on the dot and a word in its name, never the dot's colour alone.
            const dot = (
              <span className={styles.dot}>
                {n}
                {(mark === 'done' || mark === 'failed') && (
                  <svg className={styles.outcome} viewBox="0 0 16 16" aria-hidden="true">
                    <circle cx="8" cy="8" r="7" />
                    <path d={mark === 'done' ? 'M4.5 8.5l2.5 2.5 4.5-5' : 'M5 5l6 6M11 5l-6 6'} />
                  </svg>
                )}
              </span>
            );
            return attempt === undefined ? (
              <span key={n} className={styles.trial} data-mark={mark} aria-hidden="true">
                {dot}
              </span>
            ) : (
              <button
                key={n}
                type="button"
                className={styles.trial}
                data-mark={mark}
                aria-label={`Trial ${n}, ${mark === 'done' ? 'pressed' : SAID[mark]}`}
                aria-pressed={attempt === shown}
                onClick={() => choose(n)}
              >
                {dot}
              </button>
            );
          })}
        </fieldset>
      </div>
      <div className={styles.body}>
        <div className={styles.main}>
          <div ref={place} className={styles.machine} data-machine="">
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
            </div>
            {shown === undefined && overlay === undefined && <p className={styles.caption}>{caption}</p>}
            {overlay !== undefined && <div className={styles.overlay}>{overlay}</div>}
          </div>
          <div className={styles.foot}>
            <div className={styles.note}>
              <p className={styles.noteTitle}>Current step</p>
              {status}
            </div>
            {controls}
          </div>
        </div>
        <div className={styles.rail}>
          <ol className={styles.steps} aria-label="Steps">
            {progress.steps.map(({ label, mark }, i) => (
              <li
                key={i}
                className={styles.step}
                data-mark={mark}
                aria-current={mark === 'current' ? 'step' : undefined}
              >
                <svg className={styles.icon} viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="12" cy="12" r="9" />
                  {mark === 'done' && <path d="M7.5 12.5l3 3 6-7" />}
                  {mark === 'failed' && <path d="M8.5 8.5l7 7M15.5 8.5l-7 7" />}
                  {mark === 'skipped' && <path d="M8 12h8" />}
                </svg>
                <span>
                  {label}
                  <span className={styles.legend}>, {SAID[mark]}</span>
                </span>
              </li>
            ))}
          </ol>
          {result}
        </div>
      </div>
    </section>
  );
}
