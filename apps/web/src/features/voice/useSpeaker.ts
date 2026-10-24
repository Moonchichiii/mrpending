import type { Line } from '@pending/contract';
import { useEffect, useReducer, useRef, useState } from 'react';
import { initialVoice, nextLine, voiceReducer } from './model/voice';
import type { VoiceStatus } from './model/voice';
import { findVoice, speak } from './speech';

export type Speaker = {
  status: VoiceStatus;
  caption: Line | undefined;
  voice: 'looking' | 'local' | 'none';
  muted: boolean;
  setMuted: (muted: boolean) => void;
  skip: () => void;
};

// A Mute setting held by the caller, for a voice that is replaced by another during a visit.
export type Mute = { muted: boolean; setMuted: (muted: boolean) => void };

// Speaks the lines said so far, one at a time and in order; the player owns the AbortController of the line it plays.
// A new `playback` (a replay, a new build) stops the line being spoken and hears every line again; Mute carries over,
// and is the caller's when `mute` is given.
export function useSpeaker(lines: readonly Line[], playback: number | string, mute?: Mute): Speaker {
  const [state, dispatch] = useReducer(voiceReducer, initialVoice);
  const [voice, setVoice] = useState<SpeechSynthesisVoice | null | undefined>(undefined);
  const [own, setOwn] = useState(false);
  const muted = mute?.muted ?? own;
  const setMutedState = mute?.setMuted ?? setOwn;
  const [heard, setHeard] = useState(playback);
  const playing = useRef<{ id: string; controller: AbortController } | undefined>(undefined);

  if (heard !== playback) {
    setHeard(playback);
    dispatch({ type: 'reset' });
  }

  useEffect(() => {
    const controller = new AbortController();
    // A voice that cannot be found, for whatever reason, leaves captions only.
    void findVoice(controller.signal)
      .catch(() => undefined)
      .then((found) => {
        if (!controller.signal.aborted) setVoice(found ?? null);
      });
    return () => controller.abort();
  }, []);

  useEffect(
    () => () => {
      playing.current?.controller.abort();
      playing.current = undefined;
    },
    [playback],
  );

  const next = nextLine(lines, state);
  useEffect(() => {
    // The id guard keeps a re-run effect (StrictMode, a new voice) from speaking the same line twice.
    if (!next || voice === undefined || playing.current?.id === next.id) return;
    const controller = new AbortController();
    const play = { id: next.id, controller };
    playing.current = play;
    dispatch({ type: 'start', line: next });
    void speak(next, muted ? null : voice, controller.signal, () => {
      if (playing.current === play) dispatch({ type: 'speaking', id: next.id });
    }).then((outcome) => {
      // A line from a playback that has since been reset says nothing about the current one, even under the same id.
      if (playing.current === play) dispatch({ type: 'finish', id: next.id, outcome });
    });
  }, [next, voice, muted]);

  const skip = () => playing.current?.controller.abort();
  const setMuted = (value: boolean) => {
    setMutedState(value);
    if (value) skip();
  };

  return {
    status: state.status,
    caption: state.current,
    voice: voice === undefined ? 'looking' : voice === null ? 'none' : 'local',
    muted,
    setMuted,
    skip,
  };
}
