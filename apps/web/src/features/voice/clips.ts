import { Line, MAX_LINES, short } from '@pending/contract';
import { AUDIO_RATE } from './model/voice';
import type { Outcome } from './model/voice';

const BASE = `${import.meta.env.BASE_URL}voice/`;

// Written by apps/agent/scripts/voice-clips.ts beside the clips; both sites serve the same files.
const Manifest = Line.pick({ id: true, text: true })
  .extend({ sha256: short(64).regex(/^[0-9a-f]{64}$/) })
  .array()
  .max(MAX_LINES);

// Clip ids by the exact text they say.
export type Clips = ReadonlyMap<string, string>;

// How long the manifest, and then a clip, may take before the line goes to the browser voice instead.
export const WAIT_MS = 2000;

// A manifest that is late, missing or malformed means no clips.
export async function loadClips(): Promise<Clips> {
  try {
    const response = await fetch(`${BASE}manifest.json`, { signal: AbortSignal.timeout(WAIT_MS) });
    if (!response.ok) return new Map();
    const parsed = Manifest.safeParse(await response.json());
    return new Map(parsed.success ? parsed.data.map((e) => [e.text, e.id]) : []);
  } catch {
    return new Map();
  }
}

// Only a table line can have a clip, so a memo that happens to match a table line is still the browser's to say.
export const clipFor = (clips: Clips, line: Line): string | undefined =>
  line.source === 'table' ? clips.get(line.text) : undefined;

// Sticky activation: no clip plays before the visitor has pressed something on the page.
export const activated = (): boolean =>
  'userActivation' in navigator && navigator.userActivation.hasBeenActive;

// Plays one clip to its end on the speaker's one audio element, paced by mood without changing pitch.
export function playClip(
  audio: HTMLAudioElement,
  id: string,
  mood: Line['mood'],
  signal: AbortSignal,
  onStart: () => void,
): Promise<Outcome> {
  if (signal.aborted) return Promise.resolve('skipped');
  return new Promise((resolve) => {
    let settled = false;
    // The element outlives the line, so a late event or rejection from this clip must not touch the next one.
    const settle = (outcome: Outcome) => {
      if (settled) return;
      settled = true;
      clearTimeout(late);
      audio.onwaiting = null;
      audio.onplaying = null;
      audio.onended = null;
      audio.onerror = null;
      signal.removeEventListener('abort', skip);
      resolve(outcome);
    };
    // Pausing also cancels a play that is still waiting for data, so a clip given up on never starts later.
    const stop = (outcome: Outcome) => {
      audio.pause();
      settle(outcome);
    };
    const skip = () => stop('skipped');
    // Waiting for data, before the first sound or after a stall mid-line, is bounded; playing clears the bound.
    let late: ReturnType<typeof setTimeout> | undefined;
    const wait = () => {
      clearTimeout(late);
      late = setTimeout(() => stop('failed'), WAIT_MS);
    };
    wait();
    audio.onwaiting = wait;
    audio.onplaying = () => {
      clearTimeout(late);
      onStart();
    };
    audio.onended = () => settle('ended');
    audio.onerror = () => settle('failed');
    signal.addEventListener('abort', skip, { once: true });
    audio.src = `${BASE}${id}.mp3`;
    // Loading a source resets playbackRate to the default, so both are set after it.
    audio.defaultPlaybackRate = AUDIO_RATE[mood];
    audio.playbackRate = AUDIO_RATE[mood];
    audio.preservesPitch = true;
    void Promise.resolve()
      .then(() => audio.play())
      .catch(() => settle('failed'));
  });
}
