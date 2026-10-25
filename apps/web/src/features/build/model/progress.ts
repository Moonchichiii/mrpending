import { MAX_ATTEMPTS } from '@pending/contract';
import type { Attempt } from '@pending/contract';
import { assertNever } from '../../../shared/assertNever';
import { lastStep } from '../../board';
import { playhead } from './session';
import type { Session } from './session';

// skipped is a step the build never needed: a repair after a first trial that pressed the button.
export type Mark = 'done' | 'current' | 'failed' | 'pending' | 'skipped';

export const STEPS = [
  'Designing machine',
  'Running simulation',
  'Result',
  'Repairing design',
  'Testing again',
  'Final result',
] as const;

// What the board says about where a build stands: the trial on it, a mark per trial, the six steps and the pinned
// result. Every mark and sentence comes from the session's attempts and phase, never from a line said.
export type Progress = {
  attempt: number;
  trials: Mark[];
  steps: { label: string; mark: Mark }[];
  stamp: 'PENDING' | 'PRESSED';
  result: string;
};

type Head = { attempt: Attempt; step: number };

// One mark per possible trial: `current` is the one playing or being drafted; a trial the playhead has passed shows
// its own outcome, and one it has not reached is pending.
function trials(held: Attempt[], current: number | undefined, head?: Head): Mark[] {
  return Array.from({ length: MAX_ATTEMPTS }, (_, i): Mark => {
    const n = i + 1;
    if (n === current) return 'current';
    const attempt = held.find((a) => a.n === n);
    if (attempt === undefined || (head !== undefined && n > head.attempt.n)) return 'pending';
    return attempt.outcome === 'pressed' ? 'done' : 'failed';
  });
}

// The steps before `at` are done and those after it pending; `at` itself takes `mark`. The Result step names the
// outcome once the simulator has given one.
function steps(at: number, mark: Mark, outcome?: 'pressed' | 'failed', skipRepair = false) {
  return STEPS.map((label, i) => ({
    label: i === 2 && outcome !== undefined ? `${label}: ${outcome}` : label,
    mark: skipRepair && (i === 3 || i === 4) ? 'skipped' : i < at ? 'done' : i === at ? mark : 'pending',
  }));
}

const NOT_PRESSED = 'The button was not pressed.';

// A trial played to its terminal step: the Result step is current and the result says what the simulator found. After
// a repair, the repair and the retest it took stay done.
function settled(held: Attempt[], head: Head): Progress {
  const pressed = head.attempt.outcome === 'pressed';
  const marked = steps(2, 'current', pressed ? 'pressed' : 'failed');
  return {
    attempt: head.attempt.n,
    trials: trials(held, undefined, head),
    steps:
      head.attempt.n === 1
        ? marked
        : marked.map((step, i) => (i === 3 || i === 4 ? { ...step, mark: 'done' as const } : step)),
    stamp: 'PENDING',
    result: pressed
      ? 'The button was pressed.'
      : head.attempt.n < MAX_ATTEMPTS
        ? `${NOT_PRESSED} Gemma will try a repair.`
        : NOT_PRESSED,
  };
}

const IDLE: Progress = {
  attempt: 0,
  trials: trials([], undefined),
  steps: steps(-1, 'pending'),
  stamp: 'PENDING',
  result: 'Nothing has been tested yet.',
};

const DESIGNING: Progress = {
  attempt: 1,
  trials: trials([], 1),
  steps: steps(0, 'current'),
  stamp: 'PENDING',
  result: 'Gemma is designing the machine.',
};

// `revealed` is the press clock's hard cut (or an exhausted ending), where the verdict replaces the pending result.
export function progress(session: Session, revealed: boolean): Progress {
  switch (session.status) {
    case 'idle':
      return IDLE;
    case 'designing':
      return DESIGNING;
    case 'running': {
      // A running session holds at least one attempt, so the playhead always stands on one.
      const head = playhead(session.attempts, session.step);
      if (head === undefined) return DESIGNING;
      if (head.step >= lastStep(head.attempt.events)) return settled(session.attempts, head);
      const n = head.attempt.n;
      return {
        attempt: n,
        trials: trials(session.attempts, n, head),
        steps: steps(n === 1 ? 1 : 4, 'current'),
        stamp: 'PENDING',
        result: `The simulator is testing trial ${n}.`,
      };
    }
    case 'repairing': {
      const next = session.attempts.length + 1;
      return {
        attempt: next,
        trials: trials(session.attempts, next),
        steps: steps(3, 'current', 'failed'),
        stamp: 'PENDING',
        result: `${NOT_PRESSED} Gemma is repairing the design.`,
      };
    }
    case 'pressed':
    case 'exhausted': {
      const { attempts, report } = session.build;
      const last = attempts.at(-1);
      if (last === undefined) return IDLE;
      if (!revealed) return settled(attempts, { attempt: last, step: lastStep(last.events) });
      return {
        attempt: last.n,
        trials: trials(attempts, undefined),
        steps: steps(STEPS.length, 'done', report.pressed ? 'pressed' : 'failed', attempts.length === 1),
        stamp: report.pressed ? 'PRESSED' : 'PENDING',
        result: report.verdict,
      };
    }
    case 'error': {
      const held = session.attempts;
      return {
        attempt: Math.max(held.length, 1),
        trials: trials(held, undefined),
        steps: steps(held.length === 0 ? 0 : 3, 'failed', held.length === 0 ? undefined : 'failed'),
        stamp: 'PENDING',
        result: 'No result: the build stopped before the simulator could finish.',
      };
    }
    default:
      return assertNever(session);
  }
}
