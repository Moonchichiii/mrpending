import type { Form } from '@pending/contract';
import { useEffect, useReducer, useRef } from 'react';
import { streamBuild } from './model/client';
import { IDLE, reduce } from './model/session';
import type { Session, Speed } from './model/session';
import { useTicks } from './useTicks';

// The build client's owner: one AbortController per build, aborted on a new build, on cancel and on unmount.
export function useBuild(): {
  session: Session;
  file: (form: Form) => void;
  cancel: () => void;
  reset: () => void;
  pause: (paused: boolean) => void;
  replay: () => void;
  setSpeed: (speed: Speed) => void;
} {
  const [session, dispatch] = useReducer(reduce, IDLE);
  const current = useRef<{ requestId: string; controller: AbortController }>(undefined);

  useEffect(() => () => current.current?.controller.abort(), []);
  useTicks(session, dispatch);

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

  // Playback controls address the build on the board; the reducer ignores them where they do not apply.
  const pause = (paused: boolean) => {
    if (current.current) dispatch({ type: 'PAUSE', requestId: current.current.requestId, paused });
  };
  const replay = () => {
    if (current.current) dispatch({ type: 'REPLAY', requestId: current.current.requestId });
  };
  const setSpeed = (speed: Speed) => {
    if (current.current) dispatch({ type: 'SPEED', requestId: current.current.requestId, speed });
  };

  return { session, file, cancel, reset, pause, replay, setSpeed };
}
