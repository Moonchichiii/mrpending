import type { Attempt, Build, Config, Form, Line } from '@pending/contract';
import type { ReactNode } from 'react';
import { useEffect, useId, useRef, useState } from 'react';
import { assertNever } from '../../shared/assertNever';
import { Engineer } from '../engineer';
import { lastStep } from '../board';
import { Result } from '../report';
import { Voice } from '../voice';
import { BoardPanel } from './BoardPanel';
import { Controls } from './Controls';
import { ModelBadge } from './InferenceBadge';
import { MinutesFold } from './MinutesFold';
import { errorCopy } from './model/errors';
import { pressLine, pressVoiced, pressing } from './model/press';
import { progress } from './model/progress';
import { STEP_MS, failedOn, playhead, said } from './model/session';
import type { Session } from './model/session';
import { Form27B6 } from './Form27B6';
import { Hero, Stage } from './Stage';
import { useBuild } from './useBuild';
import { usePress } from './usePress';
import { useTrial } from './useTrial';
import type { Playing } from './useTrial';
import styles from './BuildDesk.module.css';

// What the status region announces; it changes per phase and per trial, never per tick. Errors use their alert.
function announcement(session: Session): string {
  switch (session.status) {
    case 'idle':
      return 'Form 27B/6 awaits filing.';
    case 'designing':
      return 'Drafting. Please do not rush the Department.';
    case 'running':
      return `Trial ${playhead(session.attempts, session.step)?.attempt.n ?? 1} in progress.`;
    case 'repairing':
      return 'A correction is being drafted.';
    case 'pressed':
    case 'exhausted':
      return session.build.report.verdict;
    case 'error':
      return '';
    default:
      return assertNever(session);
  }
}

// The lines Mr. Pending has said by the playhead; none while the form waits or after a failure.
function spoken(session: Session): Line[] {
  switch (session.status) {
    case 'idle':
    case 'error':
      return [];
    case 'designing':
      return said(session.lines, 1, 0);
    case 'running': {
      const head = playhead(session.attempts, session.step);
      return said(session.lines, head?.attempt.n ?? 1, head?.step ?? 0);
    }
    case 'repairing':
      return said(session.lines, session.attempts.length + 1, 0);
    case 'pressed':
    case 'exhausted':
      return session.build.lines;
    default:
      return assertNever(session);
  }
}

// The attempts the simulator has run so far, which say whether the line said sits on a real failure.
function held(session: Session): Attempt[] {
  switch (session.status) {
    case 'idle':
    case 'designing':
      return [];
    case 'running':
    case 'repairing':
    case 'error':
      return session.attempts;
    case 'pressed':
    case 'exhausted':
      return session.build.attempts;
    default:
      return assertNever(session);
  }
}

// Where the playhead stands: the attempt on the board and its step; outside playback, the last attempt's final frame.
function playing(session: Session): Playing | undefined {
  if (session.status === 'running') return playhead(session.attempts, session.step);
  const last = held(session).at(-1);
  return last && { attempt: last, step: lastStep(last.events) };
}

// His bubble while he has said nothing; the status region carries the phase to assistive technology.
export const INTRODUCTION =
  'Chief Engineer of the Department of Unnecessary Engineering. One job: press one blue button.';
const WAITING = 'Filing opens once the Department confirms where drafting happens.';

// One stage in every phase: Mr. Pending, his bubble and the button in the yellow band, the one board under it, and the
// Minutes and Form 27B/6 (Advanced settings) folded away under the board. The button files the form; while a build is
// on the board it waits, and once the build has ended it files the form again. A build that ends is reported once,
// however often it is replayed afterwards; onFinished says whether it was kept.
export function BuildDesk({
  canFile,
  onFinished,
  config,
  notice,
  heading,
}: {
  canFile: boolean;
  onFinished?: ((build: Build) => boolean) | undefined;
  config?: Pick<Config, 'inference' | 'model'> | undefined;
  notice?: ReactNode;
  heading?: string | undefined;
}) {
  const { session, file, cancel, reset, pause, replay: restart, setSpeed } = useBuild();
  const ended = session.status === 'pressed' || session.status === 'exhausted' ? session : undefined;
  const finishedFor = useRef<string>(undefined);
  // The request whose build this browser refused to keep; its ending says so instead of failing silently.
  const [unkept, setUnkept] = useState<string>();
  useEffect(() => {
    if (ended === undefined || onFinished === undefined || finishedFor.current === ended.requestId) return;
    finishedFor.current = ended.requestId;
    // oxlint-disable-next-line react/set-state-in-effect -- the state reports the outcome of writing to localStorage
    if (!onFinished(ended.build)) setUnkept(ended.requestId);
  }, [ended, onFinished]);
  // Replay rewinds the playhead without changing the trial, so each replay is counted to give the board a new run.
  const [take, setTake] = useState(0);
  const replay = () => {
    setTake((n) => n + 1);
    restart();
  };
  const formId = useId();
  const status = useRef<HTMLOutputElement>(null);
  // The control that was used may be disabled or replaced by the change of phase, so focus moves to the status.
  const then = (action: () => void) => () => {
    action();
    status.current?.focus();
  };
  const fileForm = (form: Form) => then(() => file(form))();
  const lines = spoken(session);
  const pressed = pressing(session);
  // The same take keeps its clock from the press tick through done, so the sequence runs once per playback.
  const press = usePress(pressed === undefined ? undefined : `${pressed}:${take}`);
  // The rig reacts to the last line said, or on a press to the line its clock has reached.
  const line = pressed === undefined ? lines.at(-1) : pressLine(lines, press.beat);
  const building =
    session.status === 'designing' || session.status === 'running' || session.status === 'repairing';
  const run = session.status === 'idle' ? 'idle' : `${session.requestId}:${take}`;
  const trial = useTrial(held(session), playing(session), run);
  // Character sheet section 6: the verdict arrives at the press's hard cut, at once on an exhausted build.
  const revealed = ended !== undefined && (ended.status === 'exhausted' || press.beat === 'cut');
  const now = progress(session, revealed);

  const playable = session.status === 'running' || session.status === 'repairing' ? session : undefined;
  // An error lies over the machine, with the step that recovers from it.
  const overlay = (): ReactNode => {
    if (session.status !== 'error') return undefined;
    const { message, action } = errorCopy(session.error);
    return (
      <div className={styles.notice}>
        <p role="alert" className={styles.error}>
          {message}
        </p>
        {action === 'retry' ? (
          <button type="button" className={styles.action} onClick={() => fileForm(session.form)}>
            Build again
          </button>
        ) : (
          <button type="button" className={styles.action} onClick={then(reset)}>
            Edit the form
          </button>
        )}
      </div>
    );
  };

  return (
    <Stage
      heading={heading}
      notice={notice}
      // One element in every phase, so the rig is not remounted between phases and the cameo's looks play once.
      engineer={
        <Engineer status={session.status} line={line} failed={failedOn(held(session), line)}>
          {/* The voice keeps its queue from drafting to the ending; a replay or a new build restarts it, and a failure
              stops it, so no line is spoken over the error or captioned beside it. Mute carries over. */}
          <Voice
            lines={pressVoiced(lines, press.beat)}
            idle={session.status === 'idle' ? INTRODUCTION : undefined}
            playback={session.status === 'error' ? `${session.requestId}:error` : run}
          />
        </Engineer>
      }
      action={<Hero form={formId} disabled={!canFile || building} note={canFile ? undefined : WAITING} />}
      board={
        <BoardPanel
          trial={trial}
          progress={now}
          // The badge names the model the build reports once it has ended, the configured one before.
          badge={<ModelBadge model={ended?.build.model ?? config?.model} where={config?.inference} />}
          run={run}
          stepMs={session.status === 'running' ? STEP_MS[session.speed] : undefined}
          pressedAt={press.at}
          caption={session.status === 'designing' ? session.partial.title : undefined}
          status={
            <output ref={status} tabIndex={-1} className={styles.status}>
              {announcement(session)}
            </output>
          }
          // Playback controls stand on the board in every phase: Pause while a trial plays, Replay once there is one;
          // Withdraw beside them while a build is on the board, so the row keeps its size.
          controls={
            <>
              <Controls
                speed={playable?.speed ?? 1}
                paused={playable?.status === 'running' ? playable.paused : undefined}
                onPause={pause}
                onReplay={(playable ?? ended) ? replay : undefined}
                onSpeed={playable && setSpeed}
              />
              <button
                type="button"
                className={styles.control}
                disabled={!building}
                onClick={then(cancel)}
                aria-label="Withdraw the form"
              >
                Withdraw
              </button>
            </>
          }
          result={
            <Result stamp={now.stamp} text={now.result}>
              {revealed && unkept === ended.requestId && (
                <p role="alert" className={styles.error}>
                  This browser would not keep the build; its storage is full or switched off. It is not in My
                  department.
                </p>
              )}
            </Result>
          }
          overlay={overlay()}
        />
      }
      folds={
        <>
          <MinutesFold trial={trial} lines={lines} ended={revealed ? ended.build : undefined} />
          <Form27B6 id={formId} onFile={fileForm} canFile={canFile} />
        </>
      }
    />
  );
}
