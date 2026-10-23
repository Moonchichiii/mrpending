import type { Line } from '@pending/contract';
import { assertNever } from '../../../shared/assertNever';

export type Mood = Line['mood'];

// The build phases the rig reacts to (ARCHITECTURE section 3); the build slice passes its session status as it is.
export type Phase = 'idle' | 'designing' | 'running' | 'repairing' | 'pressed' | 'exhausted' | 'error';

// The line on screen sets the mood (character sheet section 3); without one the phase does, and an error is always deadpan.
export function mood(status: Phase, line: Line | undefined): Mood {
  switch (status) {
    case 'idle':
      return 'slow';
    case 'error':
      return 'deadpan';
    case 'designing':
    case 'running':
    case 'repairing':
      return line?.mood ?? 'slow';
    case 'pressed':
    case 'exhausted':
      return line?.mood ?? 'deadpan';
    default:
      return assertNever(status);
  }
}
