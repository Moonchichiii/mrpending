import { MAX_ATTEMPTS, MAX_LINES } from '@pending/contract';
import type { Attempt, BlueprintPartial, Build, BuildHeader, Form, Line, Patch } from '@pending/contract';
import { report } from '@pending/machine';
import { assertNever } from '../../../shared/assertNever';
import { lastStep } from '../../board';
import type { AppError } from './errors';

export type Speed = 0.5 | 1 | 3;
export type Motion = 'full' | 'reduced';

// ARCHITECTURE section 3: 240 / 120 / 40 ms per step.
export const STEP_MS: Record<Speed, number> = { 0.5: 240, 1: 120, 3: 40 };

// ARCHITECTURE section 3, with four additions the sketch leaves implicit: idle keeps the form after a cancel, designing
// holds the lines said before the first attempt, repairing keeps the chosen speed, and running can be paused.
export type Session =
  | { status: 'idle'; form?: Form }
  | {
      status: 'designing';
      requestId: string;
      form: Form;
      startedAt: number;
      partial: BlueprintPartial;
      lines: Line[];
    }
  | {
      status: 'running';
      requestId: string;
      form: Form;
      attempts: Attempt[];
      lines: Line[];
      step: number;
      speed: Speed;
      paused: boolean;
      final?: BuildHeader;
    }
  | { status: 'repairing'; requestId: string; form: Form; attempts: Attempt[]; lines: Line[]; speed: Speed }
  | { status: 'pressed' | 'exhausted'; requestId: string; build: Build }
  | { status: 'error'; requestId: string; form: Form; attempts: Attempt[]; error: AppError };

export type SessionEvent =
  | { type: 'FILE'; requestId: string; form: Form; startedAt: number }
  | { type: 'PARTIAL'; requestId: string; partial: BlueprintPartial }
  | { type: 'LINE'; requestId: string; line: Line }
  | { type: 'ATTEMPT'; requestId: string; attempt: Attempt }
  | { type: 'PATCH'; requestId: string; n: number; patch: Patch }
  | { type: 'DONE'; requestId: string; header: BuildHeader }
  | { type: 'FAIL'; requestId: string; error: AppError }
  | { type: 'CANCEL'; requestId: string }
  | { type: 'RESET'; requestId: string }
  | { type: 'TICK'; requestId: string; motion: Motion }
  | { type: 'SPEED'; requestId: string; speed: Speed }
  | { type: 'PAUSE'; requestId: string; paused: boolean }
  | { type: 'REPLAY'; requestId: string };

export const IDLE: Session = { status: 'idle' };

// Playback runs over every held attempt in order; an attempt occupies steps 0 to its last event's step.
const span = (attempt: Attempt) => lastStep(attempt.events) + 1;
const length = (attempts: Attempt[]) => attempts.reduce((sum, a) => sum + span(a), 0);

// Where the playhead is: the attempt on the board and the step within it.
export function playhead(attempts: Attempt[], step: number): { attempt: Attempt; step: number } | undefined {
  let start = 0;
  for (const attempt of attempts) {
    if (step < start + span(attempt)) return { attempt, step: step - start };
    start += span(attempt);
  }
  const last = attempts.at(-1);
  return last && { attempt: last, step: span(last) - 1 };
}

// Whether the board has reached the button: the simulator's event says so, never a line, which a record can forge.
export const pressedAt = (head: { attempt: Attempt; step: number } | undefined): boolean =>
  head?.attempt.events.some((event) => event.type === 'button.pressed' && event.step <= head.step) ?? false;

// Whether the simulator failed the attempt a line sits on: the cameo needs that failure, never just a line claiming it.
export const failedOn = (attempts: Attempt[], line: Line | undefined): boolean =>
  line !== undefined && attempts.some((a) => a.n === line.at.attempt && a.outcome !== 'pressed');

// The lines placed at or before the playhead: earlier attempts in full, the current one up to its step.
export const said = (lines: Line[], attempt: number, step: number): Line[] =>
  lines.filter((line) => line.at.attempt < attempt || (line.at.attempt === attempt && line.at.step <= step));

// Reduced motion jumps to the final frame of the next attempt end in one tick.
function advance(attempts: Attempt[], step: number, motion: Motion): number {
  const end = length(attempts) - 1;
  if (motion === 'full') return Math.min(step + 1, end);
  let boundary = -1;
  for (const attempt of attempts) {
    boundary += span(attempt);
    if (boundary > step) return boundary;
  }
  return end;
}

const assemble = (header: BuildHeader, attempts: Attempt[], lines: Line[]): Build => ({
  ...header,
  report: report(attempts),
  attempts,
  lines,
});

function tick(state: Extract<Session, { status: 'running' }>, motion: Motion): Session {
  const end = length(state.attempts) - 1;
  const step = advance(state.attempts, state.step, motion);
  // Playback, not the server, ends the session: the tick that reaches the last event of the last attempt.
  if (step === end && state.final) {
    const build = assemble(state.final, state.attempts, state.lines);
    return { status: build.report.pressed ? 'pressed' : 'exhausted', requestId: state.requestId, build };
  }
  if (step !== state.step) return { ...state, step };
  // At the end without a header: a pressed attempt waits for done, any other waits for the correction.
  if (state.attempts.at(-1)?.outcome === 'pressed') return state;
  const { requestId, form, attempts, lines, speed } = state;
  return { status: 'repairing', requestId, form, attempts, lines, speed };
}

function attempt(state: Session, next: Attempt): Session {
  switch (state.status) {
    case 'designing': {
      if (next.n !== 1) return state;
      const { requestId, form, lines } = state;
      return {
        status: 'running',
        requestId,
        form,
        attempts: [next],
        lines,
        step: 0,
        speed: 1,
        paused: false,
      };
    }
    case 'running':
      if (next.n !== state.attempts.length + 1 || next.n > MAX_ATTEMPTS) return state;
      return { ...state, attempts: [...state.attempts, next] };
    case 'repairing': {
      if (next.n !== state.attempts.length + 1 || next.n > MAX_ATTEMPTS) return state;
      const { requestId, form, attempts, lines, speed } = state;
      return {
        status: 'running',
        requestId,
        form,
        attempts: [...attempts, next],
        lines,
        step: length(attempts),
        speed,
        paused: false,
      };
    }
    case 'idle':
    case 'pressed':
    case 'exhausted':
    case 'error':
      return state;
    default:
      return assertNever(state);
  }
}

// Replay from the start of the first attempt, during playback or after it; a finished build plays to its ending again.
function replay(state: Session): Session {
  switch (state.status) {
    case 'running':
      return { ...state, step: 0, paused: false };
    case 'repairing':
      return { ...state, status: 'running', step: 0, paused: false };
    case 'pressed':
    case 'exhausted': {
      const { attempts, lines, ...final } = state.build;
      const { requestId } = state;
      return {
        status: 'running',
        requestId,
        form: final.form,
        attempts,
        lines,
        step: 0,
        speed: 1,
        paused: false,
        final,
      };
    }
    case 'idle':
    case 'designing':
    case 'error':
      return state;
    default:
      return assertNever(state);
  }
}

// Impossible transitions and stale requestIds leave the state unchanged.
export function reduce(state: Session, event: SessionEvent): Session {
  if (event.type === 'FILE') {
    const { requestId, form, startedAt } = event;
    return { status: 'designing', requestId, form, startedAt, partial: {}, lines: [] };
  }
  if (state.status === 'idle' || state.requestId !== event.requestId) return state;
  switch (event.type) {
    case 'PARTIAL':
      return state.status === 'designing' ? { ...state, partial: event.partial } : state;
    case 'LINE':
      if (state.status !== 'designing' && state.status !== 'running' && state.status !== 'repairing')
        return state;
      return state.lines.length < MAX_LINES ? { ...state, lines: [...state.lines, event.line] } : state;
    case 'ATTEMPT':
      return attempt(state, event.attempt);
    case 'PATCH':
      // The diff is drawn from attempt.patch once that attempt has passed; the bare patch changes nothing.
      return state;
    case 'DONE':
      if (state.status === 'running') return { ...state, final: event.header };
      if (state.status !== 'repairing') return state;
      return {
        ...state,
        status: 'running',
        step: length(state.attempts) - 1,
        paused: false,
        final: event.header,
      };
    case 'FAIL': {
      if (state.status !== 'designing' && state.status !== 'running' && state.status !== 'repairing')
        return state;
      const attempts = state.status === 'designing' ? [] : state.attempts;
      return { status: 'error', requestId: state.requestId, form: state.form, attempts, error: event.error };
    }
    case 'CANCEL':
      if (state.status !== 'designing' && state.status !== 'running' && state.status !== 'repairing')
        return state;
      return { status: 'idle', form: state.form };
    case 'RESET':
      if (state.status === 'error') return { status: 'idle', form: state.form };
      if (state.status === 'pressed' || state.status === 'exhausted')
        return { status: 'idle', form: state.build.form };
      return state;
    case 'TICK':
      return state.status === 'running' && !state.paused ? tick(state, event.motion) : state;
    case 'SPEED':
      return state.status === 'running' || state.status === 'repairing'
        ? { ...state, speed: event.speed }
        : state;
    case 'PAUSE':
      return state.status === 'running' ? { ...state, paused: event.paused } : state;
    case 'REPLAY':
      return replay(state);
    default:
      return assertNever(event);
  }
}
