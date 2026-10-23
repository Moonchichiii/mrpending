import type { Build } from '@pending/contract';
import { useReducer, useRef, useState } from 'react';
import { assertNever } from '../../shared/assertNever';
import { Engineer } from '../engineer';
import { Voice } from '../voice';
import { Controls } from './Controls';
import { pressLine, pressVoiced, pressing } from './model/press';
import { STEP_MS, playhead, reduce, said } from './model/session';
import type { Session } from './model/session';
import { Lines } from './Lines';
import { Trial } from './Trial';
import { usePress } from './usePress';
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
  const head = session.status === 'running' ? playhead(session.attempts, session.step) : undefined;
  const lines =
    session.status === 'running'
      ? said(session.lines, head?.attempt.n ?? 1, head?.step ?? 0)
      : session.status === 'pressed' || session.status === 'exhausted'
        ? session.build.lines
        : [];
  // As on the desk, the voice holds "WE DID IT!" for the press clock's excited beat.
  const pressed = pressing(session);
  const press = usePress(pressed === undefined ? undefined : `${pressed}:${take}`);
  // As on the desk, the rig reacts to the last line said, or on a press to the line its clock has reached.
  const engineer = (
    <Engineer status={session.status} line={pressed === undefined ? lines.at(-1) : pressLine(lines, press)}>
      <Lines lines={lines} />
    </Engineer>
  );

  const body = () => {
    switch (session.status) {
      case 'running':
        return (
          <>
            <Controls
              speed={session.speed}
              paused={session.paused}
              onPause={(paused) => dispatch({ type: 'PAUSE', requestId: build.id, paused })}
              onReplay={replay}
              onSpeed={(speed) => dispatch({ type: 'SPEED', requestId: build.id, speed })}
            />
            <Trial
              take={take}
              attempts={session.attempts}
              attempt={head?.attempt}
              step={head?.step}
              stepMs={STEP_MS[session.speed]}
            />
            {engineer}
          </>
        );
      case 'pressed':
      case 'exhausted':
        return (
          <>
            <Trial take={take} attempts={session.build.attempts} attempt={session.build.attempts.at(-1)} />
            {engineer}
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

  return (
    <div className={styles.desk}>
      <output ref={status} tabIndex={-1} className={styles.status}>
        {session.status === 'running'
          ? `Trial ${head?.attempt.n ?? 1} in progress.`
          : session.status === 'pressed' || session.status === 'exhausted'
            ? session.build.report.verdict
            : ''}
      </output>
      {/* Outside the phases, so the voice keeps its queue from playback to the ending; a replay restarts it. */}
      <Voice lines={pressVoiced(lines, press)} playback={`${build.id}:${take}`} />
      {body()}
    </div>
  );
}
