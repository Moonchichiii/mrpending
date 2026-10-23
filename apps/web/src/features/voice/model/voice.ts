import type { Line } from '@pending/contract';

// ARCHITECTURE section 3: the voice is its own machine, so a voice failure can never hide a line.
export type VoiceStatus = 'idle' | 'loading' | 'speaking' | 'skipped' | 'failed';
export type Outcome = 'ended' | 'skipped' | 'failed';

export type VoiceState = {
  status: VoiceStatus;
  current: Line | undefined; // the line being spoken, or the last one, which stays captioned
  done: readonly string[]; // ids of lines spoken, skipped, failed or captioned only
};

export type VoiceEvent =
  | { type: 'start'; line: Line }
  | { type: 'speaking'; id: string }
  | { type: 'finish'; id: string; outcome: Outcome }
  | { type: 'reset' };

export const initialVoice: VoiceState = { status: 'idle', current: undefined, done: [] };

const busy = (state: VoiceState): boolean => state.status === 'loading' || state.status === 'speaking';

// Lines queue in the order they were said: the next one is the first not yet done.
export const nextLine = (lines: readonly Line[], state: VoiceState): Line | undefined =>
  busy(state) ? undefined : lines.find((line) => !state.done.includes(line.id));

// A line plays to its end or is skipped: a start while busy, or news about another line, changes nothing; only a new playback resets.
export function voiceReducer(state: VoiceState, event: VoiceEvent): VoiceState {
  switch (event.type) {
    case 'start':
      return busy(state) ? state : { ...state, status: 'loading', current: event.line };
    case 'speaking':
      return state.status === 'loading' && state.current?.id === event.id
        ? { ...state, status: 'speaking' }
        : state;
    case 'finish':
      return busy(state) && state.current?.id === event.id
        ? {
            ...state,
            status: event.outcome === 'ended' ? 'idle' : event.outcome,
            done: [...state.done, event.id],
          }
        : state;
    case 'reset':
      return initialVoice;
  }
}

// Browser speech has its own rate, separate from the audio tier's playbackRate (character sheet section 7).
export const RATE: Record<Line['mood'], number> = { slow: 0.8, excited: 1.1, deadpan: 0.8 };

// Only voices that run on this device, and only English ones, since every line is English; none means captions.
export function localVoice(voices: readonly SpeechSynthesisVoice[]): SpeechSynthesisVoice | undefined {
  const english = voices.filter((voice) => voice.localService && /^en([-_]|$)/i.test(voice.lang));
  return english.find((voice) => /^en[-_]gb$/i.test(voice.lang)) ?? english[0];
}
