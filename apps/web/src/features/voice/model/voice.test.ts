import { Line } from '@pending/contract';
import { expect, test } from 'vitest';
import { initialVoice, localVoice, nextLine, voiceReducer } from './voice';

const line = (id: string) =>
  Line.parse({ id, beat: 'running', mood: 'slow', text: id, source: 'table', at: { attempt: 1, step: 0 } });
const voice = (lang: string, localService: boolean): SpeechSynthesisVoice => ({
  name: `${lang} ${localService}`,
  lang,
  localService,
  default: false,
  voiceURI: `${lang}-${localService}`,
});

test('a line that is playing is never replaced: a start or news of another line changes nothing', () => {
  const [a, b] = [line('a'), line('b')];
  const speaking = voiceReducer(voiceReducer(initialVoice, { type: 'start', line: a }), {
    type: 'speaking',
    id: 'a',
  });
  expect(speaking).toMatchObject({ status: 'speaking', current: a });
  expect(nextLine([a, b], speaking)).toBeUndefined();
  expect(voiceReducer(speaking, { type: 'start', line: b })).toBe(speaking);
  expect(voiceReducer(speaking, { type: 'finish', id: 'b', outcome: 'ended' })).toBe(speaking);

  const ended = voiceReducer(speaking, { type: 'finish', id: 'a', outcome: 'ended' });
  expect(ended).toMatchObject({ status: 'idle', current: a, done: ['a'] });
  expect(nextLine([a, b], ended)).toBe(b);
});

test('a skipped or failed line ends in that state and the queue moves on', () => {
  const [a, b] = [line('a'), line('b')];
  const loading = voiceReducer(initialVoice, { type: 'start', line: a });
  for (const outcome of ['skipped', 'failed'] as const) {
    const after = voiceReducer(loading, { type: 'finish', id: 'a', outcome });
    expect(after.status).toBe(outcome);
    expect(nextLine([a, b], after)).toBe(b);
  }
});

test('only on-device English voices qualify, British first', () => {
  expect(localVoice([voice('en-GB', false), voice('fr-FR', true)])).toBeUndefined();
  expect(localVoice([voice('en-US', true), voice('en_GB', true)])?.lang).toBe('en_GB');
  expect(localVoice([voice('en-GB', false), voice('en-US', true)])?.lang).toBe('en-US');
});
