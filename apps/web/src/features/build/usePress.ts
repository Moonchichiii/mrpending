import { useEffect, useState } from 'react';
import { PRESS_MS } from './model/press';
import type { PressBeat } from './model/press';

// The press clock for one playback of a pressed build; a replay is a new playback, so the sequence runs again.
export function usePress(playback: string | undefined): PressBeat {
  const [reached, setReached] = useState<{ playback: string; beat: PressBeat }>();
  useEffect(() => {
    if (playback === undefined) return;
    const timers = [
      setTimeout(() => setReached({ playback, beat: 'excited' }), PRESS_MS.excited),
      setTimeout(() => setReached({ playback, beat: 'cut' }), PRESS_MS.cut),
    ];
    return () => timers.forEach(clearTimeout);
  }, [playback]);
  return reached !== undefined && reached.playback === playback ? reached.beat : 'before';
}
