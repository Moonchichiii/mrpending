import type { Line } from '@pending/contract';
import { RATE, localVoice } from './model/voice';
import type { Outcome } from './model/voice';

// Chrome lists its voices only after voiceschanged, possibly over several updates; none by then means none to offer.
export const VOICES_WAIT_MS = 1000;

// Async, so a speech API that throws rejects instead of breaking the caller's effect.
export async function findVoice(signal: AbortSignal): Promise<SpeechSynthesisVoice | undefined> {
  if (!('speechSynthesis' in globalThis)) return undefined;
  const synth = globalThis.speechSynthesis;
  const found = localVoice(synth.getVoices());
  if (found) return found;
  return new Promise((resolve) => {
    const settle = () => {
      clearTimeout(timer);
      synth.removeEventListener('voiceschanged', update);
      resolve(localVoice(synth.getVoices()));
    };
    const update = () => {
      if (localVoice(synth.getVoices())) settle();
    };
    const timer = setTimeout(settle, VOICES_WAIT_MS);
    synth.addEventListener('voiceschanged', update);
    signal.addEventListener('abort', settle, { once: true });
  });
}

// Speaks one line to its end; without a voice the line is captioned only, which is not a failure.
export function speak(
  line: Line,
  voice: SpeechSynthesisVoice | null,
  signal: AbortSignal,
  onStart: () => void,
): Promise<Outcome> {
  if (voice === null) return Promise.resolve('ended');
  if (signal.aborted) return Promise.resolve('skipped');
  const synth = globalThis.speechSynthesis;
  return new Promise((resolve) => {
    // A speech API that throws is a failed line like any other, so the queue and the captions move on.
    try {
      const utterance = new SpeechSynthesisUtterance(line.text);
      utterance.voice = voice;
      utterance.lang = voice.lang;
      utterance.rate = RATE[line.mood];
      utterance.onstart = onStart;
      utterance.onend = () => resolve('ended');
      // A cancel from elsewhere on the page is a skip, not a broken voice.
      utterance.onerror = (event) =>
        resolve(event.error === 'canceled' || event.error === 'interrupted' ? 'skipped' : 'failed');
      signal.addEventListener(
        'abort',
        () => {
          resolve('skipped');
          synth.cancel();
        },
        { once: true },
      );
      synth.speak(utterance);
    } catch {
      resolve('failed');
    }
  });
}
