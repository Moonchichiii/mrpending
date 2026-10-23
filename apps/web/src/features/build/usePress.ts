import { useEffect, useState } from 'react';
import { PRESS_MS } from './model/press';
import type { PressBeat } from './model/press';

// The press clock for one playback of a pressed build; a replay is a new playback, so the sequence runs again.
// With reduced motion there is no sequence: the press shows its final beat at once, as the playback clock does.
export function usePress(playback: string | undefined): PressBeat {
  const reduced = playback !== undefined && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const [reached, setReached] = useState<{ playback: string; beat: PressBeat }>();
  useEffect(() => {
    if (playback === undefined || reduced) return;
    const timers = [
      setTimeout(() => setReached({ playback, beat: 'excited' }), PRESS_MS.excited),
      setTimeout(() => setReached({ playback, beat: 'cut' }), PRESS_MS.cut),
    ];
    return () => timers.forEach(clearTimeout);
  }, [playback, reduced]);
  if (reduced) return 'cut';
  return reached !== undefined && reached.playback === playback ? reached.beat : 'before';
}
