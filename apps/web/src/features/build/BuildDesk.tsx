import type { Attempt, Build, Form, Line } from '@pending/contract';
import { useEffect, useRef, useState } from 'react';
import { assertNever } from '../../shared/assertNever';
import { Engineer } from '../engineer';
import { EngineeringReport } from '../report';
import { Voice } from '../voice';
import { Controls } from './Controls';
import { errorCopy } from './model/errors';
import { pressLine, pressVoiced, pressing } from './model/press';
import { STEP_MS, failedOn, playhead, said } from './model/session';
import type { Session } from './model/session';
import { Form27B6 } from './Form27B6';
import { Lines } from './Lines';
import { Trial } from './Trial';
import { useBuild } from './useBuild';
import { usePress } from './usePress';
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

// The lines Mr. Pending has said by the playhead; none while the form is open or after a failure.
function spoken(session: Session): Line[] | undefined {
  switch (session.status) {
    case 'idle':
    case 'error':
      return undefined;
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

// The attempts the simulator has run so far, which say whether the line on the card sits on a real failure.
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

// Mr. Pending and Form 27B/6 when nothing is in progress; the build's progress, ending or failure otherwise.
// A build that ends is reported once, however often it is replayed afterwards; onFinished says whether it was kept.
export function BuildDesk({
  canFile,
  onFinished,
}: {
  canFile: boolean;
  onFinished?: ((build: Build) => boolean) | undefined;
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
  // Replay rewinds the playhead without changing the trial, so each replay is counted to give the board a new key.
  const [take, setTake] = useState(0);
  const replay = () => {
    setTake((n) => n + 1);
    restart();
  };
  const status = useRef<HTMLOutputElement>(null);
  // The control that was used disappears with each change of phase, so focus moves to the persistent status.
  const then = (action: () => void) => () => {
    action();
    status.current?.focus();
  };
  const fileForm = (form: Form) => then(() => file(form))();
  const lines = spoken(session);
  const pressed = pressing(session);
  // The same take keeps its clock from the press tick through done, so the sequence runs once per playback.
  const press = usePress(pressed === undefined ? undefined : `${pressed}:${take}`);
  // The rig reacts to the last line said, or on a press to the line its clock has reached; its card holds the lines list.
  const line = lines && (pressed === undefined ? lines.at(-1) : pressLine(lines, press.beat));
  // One key in every phase, so the card is not remounted between phases and the cameo's looks play once.
  const engineer = lines && (
    <Engineer key="engineer" status={session.status} line={line} failed={failedOn(held(session), line)}>
      <Lines lines={lines} />
    </Engineer>
  );
  const withdraw = (
    <button type="button" className={styles.action} onClick={then(cancel)}>
      Withdraw the form
    </button>
  );

  const body = () => {
    switch (session.status) {
      case 'idle':
        return (
          <>
            {/* The status line is his card here; the status region carries it to assistive technology. */}
            <Engineer key="engineer" status="idle" line={undefined} failed={false}>
              <p aria-hidden="true">{announcement(session)}</p>
            </Engineer>
            <Form27B6 initial={session.form} onFile={fileForm} canFile={canFile} />
          </>
        );
      case 'designing':
        return (
          <>
            {session.partial.title && <p className={styles.title}>{session.partial.title}</p>}
            {engineer}
            {withdraw}
          </>
        );
      case 'running': {
        const head = playhead(session.attempts, session.step);
        return (
          <>
            <Controls
              speed={session.speed}
              paused={session.paused}
              onPause={pause}
              onReplay={replay}
              onSpeed={setSpeed}
            />
            <Trial
              key="trial"
              take={take}
              attempts={session.attempts}
              attempt={head?.attempt}
              step={head?.step}
              stepMs={STEP_MS[session.speed]}
              pressedAt={press.at}
            />
            {engineer}
            {withdraw}
          </>
        );
      }
      case 'repairing':
        return (
          <>
            <Controls
              speed={session.speed}
              paused={undefined}
              onPause={pause}
              onReplay={replay}
              onSpeed={setSpeed}
            />
            <Trial key="trial" take={take} attempts={session.attempts} attempt={session.attempts.at(-1)} />
            {engineer}
            {withdraw}
          </>
        );
      case 'pressed':
      case 'exhausted':
        return (
          <>
            <p className={styles.title}>{session.build.title}</p>
            {unkept === session.requestId && (
              <p role="alert" className={styles.error}>
                This browser would not keep the build; its storage is full or switched off. It is not in My
                department.
              </p>
            )}
            <Trial
              key="trial"
              take={take}
              attempts={session.build.attempts}
              attempt={session.build.attempts.at(-1)}
              pressedAt={press.at}
            />
            {engineer}
            {/* Character sheet section 6: the report slides up at the press's hard cut, at once on an exhausted build. */}
            {(session.status === 'exhausted' || press.beat === 'cut') && (
              <EngineeringReport build={session.build} />
            )}
            <button type="button" className={styles.action} onClick={then(replay)}>
              Replay from the start
            </button>
            <button type="button" className={styles.action} onClick={then(reset)}>
              File another form
            </button>
          </>
        );
      case 'error': {
        const { message, action } = errorCopy(session.error);
        return (
          <>
            <p role="alert" className={styles.error}>
              {message}
            </p>
            <Trial key="trial" take={take} attempts={session.attempts} attempt={session.attempts.at(-1)} />
            {action === 'retry' ? (
              <button type="button" className={styles.action} onClick={() => fileForm(session.form)}>
                Build again
              </button>
            ) : (
              <button type="button" className={styles.action} onClick={then(reset)}>
                Edit the form
              </button>
            )}
          </>
        );
      }
      default:
        return assertNever(session);
    }
  };

  return (
    <div className={styles.desk}>
      <output
        ref={status}
        tabIndex={-1}
        className={session.status === 'idle' ? `${styles.status} ${styles.quiet}` : styles.status}
      >
        {announcement(session)}
      </output>
      {/* Outside the phases, so the voice keeps its queue from drafting to the ending; a replay or a new build restarts it. */}
      {session.status !== 'idle' && lines && (
        <Voice lines={pressVoiced(lines, press.beat)} playback={`${session.requestId}:${take}`} />
      )}
      {body()}
    </div>
  );
}
