import { useEffect, useState } from 'react';
import { PRESS_MS } from './model/press';
import type { PressBeat } from './model/press';

const REDUCED = '(prefers-reduced-motion: reduce)';

// The press clock for one playback of a pressed build; a replay is a new playback, so the sequence runs again.
// With reduced motion there is no sequence: the press shows its final beat at once, as the playback clock does, and
// reduced motion switched on during the press cuts to that beat and cancels the rest; the press never runs back.
export function usePress(playback: string | undefined): PressBeat {
  const [reached, setReached] = useState<{ playback: string; beat: PressBeat }>();
  useEffect(() => {
    if (playback === undefined) return;
    const media = window.matchMedia(REDUCED);
    const timers: ReturnType<typeof setTimeout>[] = [];
    const cut = () => {
      timers.forEach(clearTimeout);
      setReached({ playback, beat: 'cut' });
    };
    if (media.matches) return cut();
    timers.push(
      setTimeout(() => setReached({ playback, beat: 'excited' }), PRESS_MS.excited),
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
  const beat = reached !== undefined && reached.playback === playback ? reached.beat : 'before';
  // The first render of a press comes before its effect, so it reads the preference itself.
  if (playback !== undefined && beat !== 'cut' && window.matchMedia(REDUCED).matches) return 'cut';
  return beat;
}
