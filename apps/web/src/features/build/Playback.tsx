import type { Build } from '@pending/contract';
import { useReducer, useRef, useState } from 'react';
import { assertNever } from '../../shared/assertNever';
import { Controls } from './Controls';
import { STEP_MS, playhead, pressedAt, reduce, said } from './model/session';
import type { Session } from './model/session';
import { Lines } from './Lines';
import { Trial, skipVoice } from './Trial';
import { useTicks } from './useTicks';
import styles from './BuildDesk.module.css';

// A finished build is replayed by the build session itself: REPLAY turns its ending into playback from step 0.
const start = (build: Build): Session =>
  reduce(
    { status: build.report.pressed ? 'pressed' : 'exhausted', requestId: build.id, build },
    { type: 'REPLAY', requestId: build.id },
  );

// A recorded build played back on the board with its minutes and lines; nothing here contacts the agent.
export function Playback({ build }: { build: Build }) {
  const [session, dispatch] = useReducer(reduce, build, start);
  useTicks(session, dispatch);
  // As on the desk: each replay gives the board a new key, and focus moves to the status the used control leaves.
  const [take, setTake] = useState(0);
  const status = useRef<HTMLOutputElement>(null);
  const replay = () => {
    setTake((n) => n + 1);
    dispatch({ type: 'REPLAY', requestId: build.id });
    status.current?.focus();
  };

  // The line card keeps one key in every phase, so its rig is not remounted and a press plays once.
  const body = () => {
    switch (session.status) {
      case 'running': {
        const head = playhead(session.attempts, session.step);
        return (
          <>
            <Controls
              speed={session.speed}
              paused={session.paused}
              onPause={(paused) => dispatch({ type: 'PAUSE', requestId: build.id, paused })}
              onReplay={replay}
              onSkipVoice={skipVoice}
              onSpeed={(speed) => dispatch({ type: 'SPEED', requestId: build.id, speed })}
            />
            <Trial
              take={take}
              attempts={session.attempts}
              attempt={head?.attempt}
              step={head?.step}
              stepMs={STEP_MS[session.speed]}
            />
            <Lines
              key="lines"
              status={session.status}
              lines={said(session.lines, head?.attempt.n ?? 1, head?.step ?? 0)}
              attempts={session.attempts}
              pressed={pressedAt(head)}
            />
          </>
        );
      }
      case 'pressed':
      case 'exhausted':
        return (
          <>
            <Trial take={take} attempts={session.build.attempts} attempt={session.build.attempts.at(-1)} />
            <Lines
              key="lines"
              status={session.status}
              lines={session.build.lines}
              attempts={session.build.attempts}
              pressed={session.build.report.pressed}
            />
            <button type="button" className={styles.action} onClick={replay}>
              Replay from the start
            </button>
          </>
        );
      // A recorded build carries its ending, so playback never waits for a stream.
      case 'idle':
      case 'designing':
      case 'repairing':
      case 'error':
        return null;
      default:
        return assertNever(session);
    }
  };

  const head = session.status === 'running' ? playhead(session.attempts, session.step) : undefined;
  return (
    <div className={styles.desk}>
      <output ref={status} tabIndex={-1} className={styles.status}>
        {session.status === 'running'
          ? `Trial ${head?.attempt.n ?? 1} in progress.`
          : session.status === 'pressed' || session.status === 'exhausted'
            ? session.build.report.verdict
            : ''}
      </output>
      {body()}
    </div>
  );
}
