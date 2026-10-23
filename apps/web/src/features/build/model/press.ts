import type { Line } from '@pending/contract';

// Character sheet section 6: from the tick that reaches button.pressed, the rig goes excited at 0.90 s and makes its
// one hard cut to deadpan at 1.60 s, at every speed.
export const PRESS_MS = { excited: 900, cut: 1600 } as const;
export type PressBeat = 'before' | 'excited' | 'cut';

// The line the rig reacts to on the press clock. The pressed lines all sit on the terminal step, so the last line said
// would skip the excited beat: before 0.90 s the rig keeps the line before them, then "WE DID IT!", then the last line.
export function pressLine(lines: Line[], beat: PressBeat): Line | undefined {
  const first = lines.findIndex((line) => line.beat === 'pressed');
  if (first === -1 || beat === 'cut') return lines.at(-1);
  return beat === 'excited' ? lines[first] : lines[first - 1];
}

// The lines the voice queue may speak on the press clock: the pressed lines wait for the excited beat at 0.90 s (no
// clock is still before it), so "WE DID IT!" is neither spoken nor captioned before its cue; then the queue keeps its pace.
export function pressVoiced(lines: Line[], beat: PressBeat): Line[] {
  return beat === 'before' ? lines.filter((line) => line.beat !== 'pressed') : lines;
}
