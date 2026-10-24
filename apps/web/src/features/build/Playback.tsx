import type { Build } from '@pending/contract';
import type { ReactNode } from 'react';
import { useEffect, useReducer, useRef, useState } from 'react';
import { assertNever } from '../../shared/assertNever';
import { Engineer } from '../engineer';
import { EngineeringReport } from '../report';
import { Voice } from '../voice';
import type { Mute } from '../voice';
import { Controls } from './Controls';
import { pressLine, pressVoiced, pressing } from './model/press';
import { STEP_MS, failedOn, playhead, reduce, said } from './model/session';
import type { Session } from './model/session';
import { Lines } from './Lines';
import { Stage, source } from './Stage';
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

// A recorded build played back on the same screen as a live one; nothing here contacts the agent. `focused` sends focus
// to the status on mount, and `mute` keeps the Mute setting, for a screen that started the playback and gave way to it.
export function Playback({
  build,
  heading,
  focused = false,
  mute,
}: {
  build: Build;
  heading?: ReactNode;
  focused?: boolean;
  mute?: Mute | undefined;
}) {
  const [session, dispatch] = useReducer(reduce, build, start);
  useTicks(session, dispatch);
  // As on the desk: each replay gives the board a new key, and focus moves to the status the used control leaves.
  const [take, setTake] = useState(0);
  const status = useRef<HTMLOutputElement>(null);
  useEffect(() => {
    if (focused) status.current?.focus();
  }, [focused]);
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
  // As on the desk, the rig reacts to the last line said, or on a press to the line its clock has reached; the sloth
  // needs the recorded attempts to show the line's trial failed.
  const line = pressed === undefined ? lines.at(-1) : pressLine(lines, press.beat);

  // The action in the top row and the board under it.
  const phase = (): { action: ReactNode; board: ReactNode } => {
    switch (session.status) {
      case 'running':
        return {
          action: (
            <Controls
              speed={session.speed}
              paused={session.paused}
              onPause={(paused) => dispatch({ type: 'PAUSE', requestId: build.id, paused })}
              onReplay={replay}
              onSpeed={(speed) => dispatch({ type: 'SPEED', requestId: build.id, speed })}
            />
          ),
          // A fragment here as at the ending, so the keyed trial keeps its board from playback to the ending.
          board: (
            <>
              <Trial
                key="trial"
                take={take}
                attempts={session.attempts}
                attempt={head?.attempt}
                step={head?.step}
                stepMs={STEP_MS[session.speed]}
                pressedAt={press.at}
              />
            </>
          ),
        };
      case 'pressed':
      case 'exhausted':
        return {
          action: (
            <button type="button" className={styles.action} onClick={replay}>
              Replay from the start
            </button>
          ),
          board: (
            <>
              <Trial
                key="trial"
                take={take}
                attempts={session.build.attempts}
                attempt={session.build.attempts.at(-1)}
                pressedAt={press.at}
              />
              {/* Character sheet section 6: the report slides up at the press's hard cut, at once on an exhausted build. */}
              {(session.status === 'exhausted' || press.beat === 'cut') && (
                <EngineeringReport build={session.build} />
              )}
            </>
          ),
        };
      // A recorded build carries its ending, so playback never waits for a stream.
      case 'idle':
      case 'designing':
      case 'repairing':
      case 'error':
        return { action: null, board: null };
      default:
        return assertNever(session);
    }
  };
  const { action, board } = phase();

  return (
    <Stage
      heading={heading}
      // As on the desk, the card keeps one key in every phase.
      card={
        <Engineer key="engineer" status={session.status} line={line} failed={failedOn(build.attempts, line)}>
          <Lines lines={lines} />
        </Engineer>
      }
      // Outside the phases, so the voice keeps its queue from playback to the ending; a replay restarts it.
      voice={<Voice lines={pressVoiced(lines, press.beat)} playback={`${build.id}:${take}`} mute={mute} />}
      action={
        <>
          <output ref={status} tabIndex={-1} className={styles.status}>
            {session.status === 'running'
              ? `Trial ${head?.attempt.n ?? 1} in progress.`
              : session.status === 'pressed' || session.status === 'exhausted'
                ? session.build.report.verdict
                : ''}
          </output>
          {action}
        </>
      }
      header={source(build.model, 'recorded')}
      board={board}
    />
  );
}
