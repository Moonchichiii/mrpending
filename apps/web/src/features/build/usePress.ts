import { useLayoutEffect, useState } from 'react';
import { PRESS_MS } from './model/press';
import type { PressBeat } from './model/press';

const REDUCED = '(prefers-reduced-motion: reduce)';

// The press clock for one playback of a pressed build; a replay is a new playback, so the sequence runs again.
// `at` is the performance.now() the clock started at, taken before the press is painted, so the board's beats and the
// rig's share one clock. With reduced motion there is no sequence: the press shows its final beat at once, as the
// playback clock does, and reduced motion switched on during the press cuts to that beat and cancels the rest; the
// press never runs back. From the cut `at` is undefined, so the board draws the press at rest and allowing motion
// again cannot replay its beats.
export function usePress(playback: string | undefined): { beat: PressBeat; at: number | undefined } {
  const [reached, setReached] = useState<{ playback: string; at: number; beat: PressBeat }>();
  useLayoutEffect(() => {
    if (playback === undefined) return;
    const at = performance.now();
    const media = window.matchMedia(REDUCED);
    const timers: ReturnType<typeof setTimeout>[] = [];
    const reach = (beat: PressBeat) => setReached({ playback, at, beat });
    const cut = () => {
      timers.forEach(clearTimeout);
      reach('cut');
    };
    if (media.matches) return cut();
    reach('before');
    timers.push(
      setTimeout(() => reach('excited'), PRESS_MS.excited),
      setTimeout(cut, PRESS_MS.cut),
    );
    // Each matchMedia call gives a new list, so its one change handler is this press's own.
    media.onchange = () => {
      if (media.matches) cut();
    };
    return () => {
      timers.forEach(clearTimeout);
      media.onchange = null;
    };
  }, [playback]);
  const current = reached !== undefined && reached.playback === playback ? reached : undefined;
  const beat = current?.beat ?? 'before';
  // The first render of a press comes before its effect, so it reads the preference itself.
  if (playback !== undefined && beat !== 'cut' && window.matchMedia(REDUCED).matches)
    return { beat: 'cut', at: undefined };
  return { beat, at: beat === 'cut' ? undefined : current?.at };
}
