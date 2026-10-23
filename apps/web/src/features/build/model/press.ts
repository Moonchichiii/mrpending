import type { Line } from '@pending/contract';
import { playhead } from './session';
import type { Session } from './session';

// Character sheet section 6: from the tick that reaches button.pressed, the rig goes excited at 0.90 s and makes its
// one hard cut to deadpan at 1.60 s, at every speed.
export const PRESS_MS = { excited: 900, cut: 1600 } as const;
export type PressBeat = 'before' | 'excited' | 'cut';

// The line the rig reacts to on the press clock. The pressed lines all sit on the terminal step, so the last line said
// would skip the excited beat: before 0.90 s the rig keeps the line before them, then "WE DID IT!", then the last line.
// The handoff's excited burst ends when the terminal beat arrives, so until a pressed line is due the rig skips back
// past it, also while the pressed lines have not yet arrived.
export function pressLine(lines: Line[], beat: PressBeat): Line | undefined {
  const first = lines.findIndex((line) => line.beat === 'pressed');
  if (first !== -1 && beat === 'cut') return lines.at(-1);
  if (first !== -1 && beat === 'excited') return lines[first];
  return (first === -1 ? lines : lines.slice(0, first)).filter((line) => line.beat !== 'handoff').at(-1);
}

// The lines the voice queue may speak on the press clock: the pressed lines wait for the excited beat at 0.90 s (no
// clock is still before it), so "WE DID IT!" is neither spoken nor captioned before its cue; then the queue keeps its pace.
export function pressVoiced(lines: Line[], beat: PressBeat): Line[] {
  return beat === 'before' ? lines.filter((line) => line.beat !== 'pressed') : lines;
}

// The success sequence starts on the tick that reaches button.pressed, never on done (ARCHITECTURE section 3), so a
// playhead waiting at the press for the header is already on the press clock. Gives the request being pressed.
export function pressing(session: Session): string | undefined {
  if (session.status === 'pressed') return session.requestId;
  if (session.status !== 'running') return undefined;
  const head = playhead(session.attempts, session.step);
  const press = head?.attempt.events.find((event) => event.type === 'button.pressed');
  return head !== undefined && press !== undefined && head.step >= press.step ? session.requestId : undefined;
}
