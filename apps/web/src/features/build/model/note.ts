import { assertNever } from '../../../shared/assertNever';
import { lastStep } from '../../board';
import { ACTIONS, errorCopy } from './errors';
import { playhead } from './session';
import type { Session } from './session';

// The Current step note: a bold label and one sentence, from the session's phase and the simulator's attempts only.
// `waiting` is set while the stage waits for the model, and `alert` when the error's own alert already says it.
export type Note = { label?: string; text: string; waiting: boolean; alert: boolean };

// `revealed` is the press clock's hard cut; `replay` is a recording, which never waits for a model; `connecting` is the
// local stage asking where drafting happens.
export type NoteOptions = { revealed: boolean; replay: boolean; connecting?: boolean };

const say = (label: string, text: string, waiting = false): Note => ({ label, text, waiting, alert: false });

const TESTING = 'The simulator is checking whether the ball reaches the blue button.';

export function currentStep(session: Session, { revealed, replay, connecting = false }: NoteOptions): Note {
  switch (session.status) {
    case 'idle':
      if (connecting)
        return say("Checking the Department's equipment", 'Confirming the model on this machine.');
      if (replay) return say('REPLAY', 'Press the button to replay a recorded run.');
      return { text: 'Form 27B/6 awaits filing.', waiting: false, alert: false };
    case 'designing':
      return replay
        ? say("REPLAYING GEMMA'S DESIGN", 'A recorded blueprint from Gemma is replayed on the board.')
        : say('GEMMA IS DESIGNING', 'A small AI model is drawing a mechanical blueprint.', true);
    case 'running': {
      const head = playhead(session.attempts, session.step);
      const n = head?.attempt.n ?? 1;
      if (
        head !== undefined &&
        head.attempt.outcome !== 'pressed' &&
        head.step >= lastStep(head.attempt.events)
      )
        return say('THE BUTTON WAS NOT PRESSED', 'The simulator found where the attempt stopped.');
      return say(n === 1 ? 'TESTING THE MACHINE' : 'TESTING THE REVISED MACHINE', TESTING);
    }
    case 'repairing':
      return replay
        ? say("REPLAYING GEMMA'S REPAIR", "Gemma's recorded correction is replayed on the board.")
        : say('GEMMA IS TRYING A REPAIR', 'The findings went back to Gemma for a correction.', true);
    case 'pressed':
    case 'exhausted': {
      const { attempts, report } = session.build;
      // Until the hard cut the last trial is still on the board as it played.
      if (!revealed)
        return say(attempts.length > 1 ? 'TESTING THE REVISED MACHINE' : 'TESTING THE MACHINE', TESTING);
      return report.pressed
        ? say('IT WORKED', "Gemma's machine pressed the button. The simulator verified it.")
        : say('STILL PENDING', 'Gemma tried; the simulator never recorded a press.');
    }
    case 'error': {
      const { message, action } = errorCopy(session.error);
      return { label: message, text: `Next: ${ACTIONS[action]}.`, waiting: false, alert: true };
    }
    default:
      return assertNever(session);
  }
}
