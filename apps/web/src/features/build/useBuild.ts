import type { Form } from '@pending/contract';
import { useEffect, useReducer, useRef } from 'react';
import { streamBuild } from './model/client';
import { IDLE, reduce } from './model/session';
import type { Session, Speed } from './model/session';

// ARCHITECTURE section 3: 240 / 120 / 40 ms per step.
const STEP_MS: Record<Speed, number> = { 0.5: 240, 1: 120, 3: 40 };

// The build client's owner: one AbortController per build, aborted on a new build, on cancel and on unmount.
export function useBuild(): {
  session: Session;
  file: (form: Form) => void;
  cancel: () => void;
  reset: () => void;
} {
  const [session, dispatch] = useReducer(reduce, IDLE);
  const current = useRef<{ requestId: string; controller: AbortController }>(undefined);

  useEffect(() => () => current.current?.controller.abort(), []);

  const ticking = session.status === 'running' ? session.requestId : undefined;
  const speed = session.status === 'running' ? session.speed : 1;
  useEffect(() => {
    if (ticking === undefined) return;
    const timer = setInterval(() => {
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      dispatch({ type: 'TICK', requestId: ticking, motion: reduced ? 'reduced' : 'full' });
    }, STEP_MS[speed]);
    return () => clearInterval(timer);
  }, [ticking, speed]);

  const file = (form: Form) => {
    current.current?.controller.abort();
    const requestId = crypto.randomUUID();
    const controller = new AbortController();
    current.current = { requestId, controller };
    dispatch({ type: 'FILE', requestId, form, startedAt: performance.now() });
    void streamBuild(form, requestId, controller.signal, dispatch);
  };

  // Playback can outlive the stream, so a cancel also tells the reducer directly; a second CANCEL changes nothing.
  const cancel = () => {
    if (!current.current) return;
    current.current.controller.abort();
    dispatch({ type: 'CANCEL', requestId: current.current.requestId });
  };

  const reset = () => {
    if (current.current) dispatch({ type: 'RESET', requestId: current.current.requestId });
  };

  return { session, file, cancel, reset };
}
