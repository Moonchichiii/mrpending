import { Build } from '@pending/contract';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test, vi } from 'vitest';
import engineer from '../engineer/Engineer.module.css';
import { header, lost, pressed } from './model/testBuild';
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

  // Esc skips the line being spoken from anywhere on the record page, once the bubble shows it is being spoken.
  await vi.waitFor(() =>
    expect(voice.querySelector('[data-speaking]')?.getAttribute('data-speaking')).toBe('true'),
  );
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
// The board's own button; the button beside Mr. Pending is the same sprite.
const boardButton = () => screen.getByRole('region', { name: 'The board' }).querySelector('[data-button]');

test('a recorded press plays on the rig beside its bubble: slow in the trial, excited on the press, then deadpan', async () => {
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  render(<Playback build={pressedRecord} />);

  const voice = screen.getByRole('region', { name: 'Voice' });
  expect(voice.parentElement?.parentElement?.querySelector('svg[data-variant="desk"]')).not.toBeNull();
  expect(mood()).toBe('slow');
  await vi.waitFor(() => expect(mood()).toBe('excited'), { timeout: 5000 });
  await vi.waitFor(() => expect(mood()).toBe('deadpan'), { timeout: 1500 });
});

test('the excited handoff ends when the trial reaches its terminal beat, before the press goes excited', async () => {
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  const handed = Build.parse({
    ...pressedRecord,
    lines: [
      ...pressedRecord.lines.slice(0, 1),
      { id: 'h1', beat: 'handoff', mood: 'excited', text: 'Contact!', source: 'table', at: at(1) },
      ...pressedRecord.lines.slice(1),
    ],
  });
  render(<Playback build={handed} />);
  const button = () => boardButton()?.getAttribute('data-pressed');

  await vi.waitFor(() => expect(mood()).toBe('excited'), { timeout: 1000 });
  expect(button()).not.toBe('true');
  await vi.waitFor(() => expect(button()).toBe('true'), { timeout: 5000 });
  expect(mood()).toBe('slow');
  await vi.waitFor(() => expect(mood()).toBe('excited'), { timeout: 1500 });
  await vi.waitFor(() => expect(mood()).toBe('deadpan'), { timeout: 1500 });
});

test('a recorded cameo line brings the sloth only on the failure the simulator recorded', async () => {
  vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
  const cameo = {
    id: 'c1',
    beat: 'cameo',
    mood: 'deadpan',
    text: 'This is why we employ snails.',
    source: 'table',
    at: at(end),
  } as const;
  // The record claims the Sloth Incident on its pressed trial; the line is shown, the sloth is not.
  render(<Playback build={Build.parse({ ...recorded, lines: [...recorded.lines, cameo] })} />);
  await vi.waitFor(() =>
    expect(screen.getByRole('list', { name: 'Mr. Pending' }).textContent).toContain('employ snails'),
  );
  expect(document.querySelector('[data-sloth]')).toBeNull();
});

const result = () => screen.getByRole('region', { name: 'Simulation result' });
const stamp = () => result().querySelector('[data-stamp]')?.textContent;
const report = () => screen.queryByRole('region', { name: 'Engineering Report' });

test('the result turns PRESSED at the hard cut to deadpan, on the board that drew the press from the start', async () => {
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  render(<Playback build={pressedRecord} />);
  const board = () => boardButton()?.closest('svg');
  const first = board();

  await vi.waitFor(() => expect(board()?.getAttribute('data-press')).toBe('sequence'), { timeout: 5000 });
  // The trial keeps its place from playback to the ending, so the press plays on the board that ran the trial.
  expect(board()).toBe(first);
  expect(stamp()).toBe('PENDING');
  expect(report()).toBeNull();
  await vi.waitFor(() => expect(mood()).toBe('excited'), { timeout: 1500 });
  expect(stamp()).toBe('PENDING');
  await vi.waitFor(() => expect(stamp()).toBe('PRESSED'), { timeout: 1500 });
  expect(mood()).toBe('deadpan');
  expect(result().textContent).toContain(pressedRecord.report.verdict);
  // The Engineering Report joins the Minutes at the same cut.
  expect(report()?.querySelector('svg[data-shape] [data-stamp]')?.getAttribute('data-stamp')).toBe(
    'APPROVED',
  );
});

test('an exhausted record has no press, so its verdict shows at its ending, stamped PENDING', async () => {
  vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
  const exhausted = Build.parse({ ...header([lost(1), lost(2)]), attempts: [lost(1), lost(2)], lines: [] });
  render(<Playback build={exhausted} />);
  await vi.waitFor(() => expect(report()).not.toBeNull(), { timeout: 3000 });
  expect(document.querySelector('[data-press]')).toBeNull();
  expect(stamp()).toBe('PENDING');
  expect(result().textContent).toContain(exhausted.report.verdict);
  expect(report()?.querySelector('svg[data-shape] [data-stamp]')?.getAttribute('data-stamp')).toBe('PENDING');
});
