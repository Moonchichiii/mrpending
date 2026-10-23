import { Build } from '@pending/contract';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test, vi } from 'vitest';
import engineer from '../engineer/Engineer.module.css';
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

// The pressed lines sit on the press's terminal step, as the agent places them.
const end = pressed(1).events.at(-1)?.step ?? 0;
const at = (step: number) => ({ attempt: 1, step });
const pressedRecord = Build.parse({
  ...header([pressed(1)]),
  attempts: [pressed(1)],
  lines: [
    { id: 'l1', beat: 'running', mood: 'slow', text: 'Commencing trial 1.', source: 'table', at: at(0) },
    { id: 'l2', beat: 'pressed', mood: 'excited', text: 'WE DID IT!', source: 'table', at: at(end) },
    { id: 'l3', beat: 'pressed', mood: 'deadpan', text: 'Noted.', source: 'table', at: at(end) },
  ],
});
const mood = () => {
  const svg = document.querySelector('svg[data-variant="desk"]');
  return (['slow', 'excited', 'deadpan'] as const).find((m) => svg?.classList.contains(engineer[m] ?? ''));
};

test('a recorded press plays on the rig beside its lines: slow in the trial, excited on the press, then deadpan', async () => {
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  render(<Playback build={pressedRecord} />);

  const lines = screen.getByRole('list', { name: 'Mr. Pending' });
  expect(lines.parentElement?.parentElement?.querySelector('svg[data-variant="desk"]')).not.toBeNull();
  expect(mood()).toBe('slow');
  await vi.waitFor(() => expect(mood()).toBe('excited'), { timeout: 5000 });
  await vi.waitFor(() => expect(mood()).toBe('deadpan'), { timeout: 1500 });
});
