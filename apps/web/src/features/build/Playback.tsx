import type { Build } from '@pending/contract';
import type { ReactNode } from 'react';
import { useReducer, useRef, useState } from 'react';
import { lastStep } from '../board';
import { Engineer } from '../engineer';
import { Result } from '../report';
import { Voice } from '../voice';
import { BoardPanel } from './BoardPanel';
import { Controls } from './Controls';
import { ModelBadge } from './InferenceBadge';
import { MinutesFold } from './MinutesFold';
import { pressLine, pressVoiced, pressing } from './model/press';
import { currentStep } from './model/note';
import { progress } from './model/progress';
import { IDLE, STEP_MS, failedOn, playhead, reduce, said } from './model/session';
import type { Session, SessionEvent } from './model/session';
import { Hero, Stage } from './Stage';
import { usePress } from './usePress';
import { useTicks } from './useTicks';
import { useTrial } from './useTrial';

// A finished build is replayed by the build session itself: REPLAY turns its ending into playback from step 0.
const start = (build: Build): Session =>
  reduce(
    { status: build.report.pressed ? 'pressed' : 'exhausted', requestId: build.id, build },
    { type: 'REPLAY', requestId: build.id },
  );
const play = (session: Session, event: SessionEvent | { type: 'START'; build: Build }): Session =>
  event.type === 'START' ? start(event.build) : reduce(session, event);

// A recorded build played back on the same stage as a live one; nothing here contacts the agent. A front door's stage
// stands idle until its button is pressed; a record page (`autoplay`) plays at once and has no button of its own, so a
// page never offers two. `build` is undefined while the recording is fetched, and `blocked` keeps the button waiting
// with `note` saying why. The button and Replay play the recording again from the start; `folds` follow the Minutes.
// `about`, under the heading, says what the visitor is watching.
export function Playback({
  build,
  heading,
  about,
  intro,
  note,
  blocked = false,
  autoplay = true,
  folds,
}: {
  build: Build | undefined;
  heading?: string | undefined;
  about?: ReactNode;
  intro?: string | undefined;
  note?: string | undefined;
  blocked?: boolean;
  autoplay?: boolean;
  folds?: ReactNode;
}) {
  const [session, dispatch] = useReducer(play, autoplay && build ? start(build) : IDLE);
  useTicks(session, dispatch);
  // As on the desk: each playback gives the board a new run, and focus moves to the status the used control leaves.
  const [take, setTake] = useState(0);
  const status = useRef<HTMLOutputElement>(null);
  const replay = () => {
    if (build === undefined) return;
    setTake((n) => n + 1);
    dispatch({ type: 'START', build });
    status.current?.focus();
  };
  const ended = session.status === 'pressed' || session.status === 'exhausted' ? session : undefined;
  const running = session.status === 'running' ? session : undefined;
  const head = running && playhead(running.attempts, running.step);
  const last = ended?.build.attempts.at(-1);
  const lines =
    session.status === 'running'
      ? said(session.lines, head?.attempt.n ?? 1, head?.step ?? 0)
      : (ended?.build.lines ?? []);
  // As on the desk, the voice holds "WE DID IT!" for the press clock's excited beat.
  const pressed = pressing(session);
  const press = usePress(pressed === undefined ? undefined : `${pressed}:${take}`);
  // As on the desk, the rig reacts to the last line said, or on a press to the line its clock has reached; the sloth
  // needs the recorded attempts to show the line's trial failed.
  const line = pressed === undefined ? lines.at(-1) : pressLine(lines, press.beat);
  const run = session.status === 'idle' ? 'idle' : `${session.requestId}:${take}`;
  const trial = useTrial(
    session.status === 'running' ? session.attempts : (ended?.build.attempts ?? []),
    head ?? (last && { attempt: last, step: lastStep(last.events) }),
    run,
  );
  const revealed = ended !== undefined && (ended.status === 'exhausted' || press.beat === 'cut');
  const now = progress(session, revealed);

  return (
    <Stage
      heading={heading}
      about={about}
      engineer={
        <Engineer status={session.status} line={line} failed={failedOn(build?.attempts ?? [], line)}>
          {/* As on the desk, the voice keeps its queue from playback to the ending; a replay restarts it. */}
          <Voice
            lines={pressVoiced(lines, press.beat)}
            idle={session.status === 'idle' ? intro : undefined}
            playback={run}
          />
        </Engineer>
      }
      action={
        autoplay ? undefined : (
          <Hero
            onPress={replay}
            disabled={build === undefined || blocked || session.status === 'running'}
            note={note}
          />
        )
      }
      board={
        <BoardPanel
          trial={trial}
          progress={now}
          badge={<ModelBadge model={build?.model} where={build && 'recorded'} />}
          run={run}
          stepMs={session.status === 'running' ? STEP_MS[session.speed] : undefined}
          pressedAt={press.at}
          note={currentStep(session, { revealed, replay: true })}
          statusRef={status}
          // As on the desk, the controls stand on the board in every phase.
          controls={
            <Controls
              speed={running?.speed ?? 1}
              paused={running?.paused}
              onPause={(paused) =>
                running && dispatch({ type: 'PAUSE', requestId: running.requestId, paused })
              }
              onReplay={(running ?? ended) ? replay : undefined}
              onSpeed={
                running && ((speed) => dispatch({ type: 'SPEED', requestId: running.requestId, speed }))
              }
            />
          }
          result={<Result stamp={now.stamp} text={now.result} roles={revealed} />}
        />
      }
      folds={
        <>
          <MinutesFold trial={trial} lines={lines} ended={revealed ? ended.build : undefined} />
          {folds}
        </>
      }
    />
  );
}
