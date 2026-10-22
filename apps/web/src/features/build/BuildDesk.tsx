import type { Attempt, Form } from '@pending/contract';
import { useRef } from 'react';
import { assertNever } from '../../shared/assertNever';
import { Board } from '../board';
import { errorCopy } from './model/errors';
import { playhead } from './model/session';
import type { Session } from './model/session';
import { Form27B6 } from './Form27B6';
import { useBuild } from './useBuild';
import styles from './BuildDesk.module.css';

// The attempt on the board, drawn at its final frame until the animated board arrives.
const Trial = ({ attempt }: { attempt: Attempt | undefined }) =>
  attempt && (
    <figure className={styles.trial}>
      <Board blueprint={attempt.blueprint} events={attempt.events} />
      <figcaption>Trial {attempt.n}</figcaption>
    </figure>
  );

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
  const { session, file, cancel, reset } = useBuild();
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
            {withdraw}
          </>
        );
      case 'running':
        return (
          <>
            <Trial attempt={playhead(session.attempts, session.step)?.attempt} />
            {withdraw}
          </>
        );
      case 'repairing':
        return (
          <>
            <Trial attempt={session.attempts.at(-1)} />
            {withdraw}
          </>
        );
      case 'pressed':
      case 'exhausted':
        return (
          <>
            <p className={styles.title}>{session.build.title}</p>
            <Trial attempt={session.build.attempts.at(-1)} />
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
            <Trial attempt={session.attempts.at(-1)} />
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
