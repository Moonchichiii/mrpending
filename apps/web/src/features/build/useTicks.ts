import { useEffect } from 'react';
import type { Dispatch } from 'react';
import { STEP_MS } from './model/session';
import type { Session, SessionEvent } from './model/session';

// The playback clock: one tick per step at the chosen speed while a session runs unpaused, reduced motion read per tick.
export function useTicks(session: Session, dispatch: Dispatch<SessionEvent>) {
  const ticking = session.status === 'running' && !session.paused ? session.requestId : undefined;
  const speed = session.status === 'running' ? session.speed : 1;
  useEffect(() => {
    if (ticking === undefined) return;
    const timer = setInterval(() => {
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      dispatch({ type: 'TICK', requestId: ticking, motion: reduced ? 'reduced' : 'full' });
    }, STEP_MS[speed]);
    return () => clearInterval(timer);
  }, [ticking, speed, dispatch]);
}
