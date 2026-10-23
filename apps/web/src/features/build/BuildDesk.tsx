import type { Attempt, Form } from '@pending/contract';
import { useRef } from 'react';
import { assertNever } from '../../shared/assertNever';
import { Board, Correction, Minutes, lastStep } from '../board';
import { Controls } from './Controls';
import { errorCopy } from './model/errors';
import { STEP_MS, playhead, said } from './model/session';
import type { Session } from './model/session';
import { Form27B6 } from './Form27B6';
import { Lines } from './Lines';
import { useBuild } from './useBuild';
import styles from './BuildDesk.module.css';

// The attempt on the board at `step` (its final frame by default), its minutes, and the correction that produced it.
function Trial({
  attempts,
  attempt,
  step = attempt ? lastStep(attempt.events) : 0,
  stepMs,
}: {
  attempts: Attempt[];
  attempt: Attempt | undefined;
  step?: number | undefined;
  stepMs?: number | undefined;
}) {
  if (!attempt) return null;
  const previous = attempts.find((a) => a.n === attempt.n - 1);
  return (
    <>
      {attempt.patch && previous && (
        <Correction n={attempt.n} previous={previous.blueprint} current={attempt.blueprint} />
      )}
      <figure className={styles.trial}>
        <Board blueprint={attempt.blueprint} events={attempt.events} step={step} stepMs={stepMs} />
        <figcaption>Trial {attempt.n}</figcaption>
      </figure>
      <Minutes n={attempt.n} events={attempt.events} step={step} />
    </>
  );
}

// No voice tier exists yet beyond the browser's own; skipping cancels whatever it is saying.
const skipVoice = () => {
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
};

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
export function BuildDesk({ canFile }: { canFile: boolean }) {
  const { session, file, cancel, reset, pause, replay, setSpeed } = useBuild();
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
            <Trial attempts={session.attempts} attempt={session.attempts.at(-1)} />
            <Lines lines={said(session.lines, session.attempts.length + 1, 0)} />
            {withdraw}
          </>
        );
      case 'pressed':
      case 'exhausted':
        return (
          <>
            <p className={styles.title}>{session.build.title}</p>
            <Trial attempts={session.build.attempts} attempt={session.build.attempts.at(-1)} />
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
            <Trial attempts={session.attempts} attempt={session.attempts.at(-1)} />
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
