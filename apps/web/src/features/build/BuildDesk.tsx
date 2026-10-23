import type { Form } from '@pending/contract';
import { useEffect, useRef, useState } from 'react';
import { assertNever } from '../../shared/assertNever';
import { keep } from '../gallery';
import { Controls } from './Controls';
import { errorCopy } from './model/errors';
import { STEP_MS, playhead, said } from './model/session';
import type { Session } from './model/session';
import { Form27B6 } from './Form27B6';
import { Lines } from './Lines';
import { Trial, skipVoice } from './Trial';
import { useBuild } from './useBuild';
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

// Form 27B/6 when nothing is in progress; the build's progress, ending or failure otherwise.
// A build that ends is kept in this browser's department once, however often it is replayed afterwards.
export function BuildDesk({ canFile, onKept }: { canFile: boolean; onKept?: (() => void) | undefined }) {
  const { session, file, cancel, reset, pause, replay: restart, setSpeed } = useBuild();
  const ended = session.status === 'pressed' || session.status === 'exhausted' ? session : undefined;
  const keptFor = useRef<string>(undefined);
  useEffect(() => {
    if (ended === undefined || keptFor.current === ended.requestId) return;
    keptFor.current = ended.requestId;
    if (keep(ended.build) !== undefined) onKept?.();
  }, [ended, onKept]);
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
  const withdraw = (
    <button type="button" className={styles.action} onClick={then(cancel)}>
      Withdraw the form
    </button>
  );

  const body = () => {
    switch (session.status) {
      case 'idle':
        return <Form27B6 initial={session.form} onFile={fileForm} canFile={canFile} />;
      case 'designing':
        return (
          <>
            {session.partial.title && <p className={styles.title}>{session.partial.title}</p>}
            <Lines lines={said(session.lines, 1, 0)} />
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
              onSkipVoice={skipVoice}
              onSpeed={setSpeed}
            />
            <Trial
              take={take}
              attempts={session.attempts}
              attempt={head?.attempt}
              step={head?.step}
              stepMs={STEP_MS[session.speed]}
            />
            <Lines lines={said(session.lines, head?.attempt.n ?? 1, head?.step ?? 0)} />
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
              onSkipVoice={skipVoice}
              onSpeed={setSpeed}
            />
            <Trial take={take} attempts={session.attempts} attempt={session.attempts.at(-1)} />
            <Lines lines={said(session.lines, session.attempts.length + 1, 0)} />
            {withdraw}
          </>
        );
      case 'pressed':
      case 'exhausted':
        return (
          <>
            <p className={styles.title}>{session.build.title}</p>
            <Trial take={take} attempts={session.build.attempts} attempt={session.build.attempts.at(-1)} />
            <Lines lines={session.build.lines} />
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
            <Trial take={take} attempts={session.attempts} attempt={session.attempts.at(-1)} />
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
      <output ref={status} tabIndex={-1} className={styles.status}>
        {announcement(session)}
      </output>
      {body()}
    </div>
  );
}
