import { Build } from '@pending/contract';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test, vi } from 'vitest';
import { header, pressed } from './model/testBuild';
import { Playback } from './Playback';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const recorded = Build.parse({
  ...header([pressed(1)]),
  attempts: [pressed(1)],
  lines: [
    {
      id: 'l1',
      beat: 'running',
      mood: 'slow',
      text: 'Commencing trial 1.',
      source: 'table',
      at: { attempt: 1, step: 0 },
    },
  ],
});

// Just the surface of the Web Speech API the voice uses: one on-device voice, and speech starts when queued.
const withSynth = () => {
  const spoken: { text: string; onstart?: () => void; onerror?: (event: { error: string }) => void }[] = [];
  const local = { name: 'en-GB', lang: 'en-GB', localService: true, default: false, voiceURI: 'en-GB' };
  const synth = Object.assign(new EventTarget(), {
    getVoices: () => [local],
    speak: (utterance: (typeof spoken)[number]) => {
      spoken.push(utterance);
      utterance.onstart?.();
    },
    cancel: vi.fn<() => void>(() => spoken.at(-1)?.onerror?.({ error: 'interrupted' })),
  });
  vi.stubGlobal('speechSynthesis', synth);
  vi.stubGlobal(
    'SpeechSynthesisUtterance',
    class {
      constructor(public text: string) {}
    },
  );
  return { spoken, cancel: synth.cancel };
};

test('a recorded build is spoken by the voice control, with Skip voice and Escape, on its playback', async () => {
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  const { spoken, cancel } = withSynth();
  const user = userEvent.setup();
  render(<Playback build={recorded} />);

  await vi.waitFor(() => expect(spoken.map((u) => u.text)).toEqual(['Commencing trial 1.']));
  const voice = screen.getByRole('region', { name: 'Voice' });
  expect(
    within(screen.getByRole('group', { name: 'Playback' })).queryByRole('button', { name: 'Skip voice' }),
  ).toBeNull();

  expect(within(voice).getByRole('button', { name: 'Skip voice' })).toBeDefined();

  // Esc skips the line being spoken from anywhere on the record page.
  await user.keyboard('{Escape}');
  expect(cancel).toHaveBeenCalledTimes(1);
});
