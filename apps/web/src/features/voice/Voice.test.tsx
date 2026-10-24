import { Line } from '@pending/contract';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, expect, test, vi } from 'vitest';
import { Voice } from './Voice';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const line = (id: string, text: string, mood: Line['mood'], source: Line['source'] = 'table') =>
  Line.parse({ id, beat: 'pressed', mood, text, source, at: { attempt: 1, step: 0 } });
const voice = (lang: string, localService: boolean): SpeechSynthesisVoice => ({
  name: lang,
  lang,
  localService,
  default: false,
  voiceURI: lang,
});

// Just the surface of the Web Speech API that the player uses; speech starts as soon as it is queued.
class FakeUtterance {
  text: string;
  voice: SpeechSynthesisVoice | null = null;
  lang = '';
  rate = 1;
  onstart: (() => void) | null = null;
  onend: (() => void) | null = null;
  onerror: ((event: { error: string }) => void) | null = null;
  constructor(text: string) {
    this.text = text;
  }
}
class FakeSynth extends EventTarget {
  voices: SpeechSynthesisVoice[];
  spoken: FakeUtterance[] = [];
  cancel = vi.fn<() => void>(() => this.spoken.at(-1)?.onerror?.({ error: 'interrupted' }));
  constructor(voices: SpeechSynthesisVoice[]) {
    super();
    this.voices = voices;
  }
  getVoices() {
    return this.voices;
  }
  speak(utterance: FakeUtterance) {
    this.spoken.push(utterance);
    utterance.onstart?.();
  }
  end() {
    act(() => this.spoken.at(-1)?.onend?.());
  }
}

function withSynth(voices: SpeechSynthesisVoice[]) {
  const synth = new FakeSynth(voices);
  vi.stubGlobal('speechSynthesis', synth);
  vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance);
  return synth;
}

const weDidIt = line('l1', 'WE DID IT! Please inform the entire Department.', 'excited');
const acknowledged = line('l2', 'The Department acknowledges this development.', 'deadpan');
const verdict = line('l3', 'One button. An extraordinary amount of paperwork.', 'deadpan');

test('the queue never cuts a line: the verdict waits for WE DID IT to end', async () => {
  const synth = withSynth([voice('en-GB', true)]);
  const { rerender } = render(<Voice lines={[weDidIt]} playback={0} />);
  await vi.waitFor(() => expect(synth.spoken).toHaveLength(1));
  expect(synth.spoken[0]).toMatchObject({ text: weDidIt.text, rate: 1.1, lang: 'en-GB' });

  // The visual beats move on while the line is still being spoken.
  rerender(<Voice lines={[weDidIt, acknowledged, verdict]} playback={0} />);
  expect(synth.spoken).toHaveLength(1);
  expect(synth.cancel).not.toHaveBeenCalled();
  expect(screen.getByText(weDidIt.text)).toBeDefined();

  synth.end();
  await vi.waitFor(() => expect(synth.spoken).toHaveLength(2));
  synth.end();
  await vi.waitFor(() => expect(synth.spoken).toHaveLength(3));
  expect(synth.spoken.map((u) => u.text)).toEqual([weDidIt.text, acknowledged.text, verdict.text]);
  expect(synth.spoken[2]?.rate).toBe(0.8);
  expect(synth.cancel).not.toHaveBeenCalled();
});

test.each([
  ['the browser has no speech at all', () => undefined],
  [
    'it has only remote or non-English voices',
    () => {
      const synth = withSynth([voice('en-GB', false), voice('fr-FR', true)]);
      setTimeout(() => synth.dispatchEvent(new Event('voiceschanged')));
      return synth;
    },
  ],
])('when %s, every line is captioned and no error is shown', async (_, setup) => {
  const synth = setup();
  render(<Voice lines={[weDidIt, verdict]} playback={0} />);
  // A voice list without a usable voice keeps the search open until VOICES_WAIT_MS.
  expect(await screen.findByText(verdict.text, undefined, { timeout: 3000 })).toBeDefined();
  expect(
    screen.getByText('This device has no voice for Mr. Pending, so his lines are captioned only.'),
  ).toBeDefined();
  expect(screen.queryByRole('alert')).toBeNull();
  expect(synth?.spoken ?? []).toEqual([]);
});

test('a speech API that throws fails the line silently and the captions move on', async () => {
  const synth = withSynth([voice('en-GB', true)]);
  const speak = vi.spyOn(synth, 'speak').mockImplementation(() => {
    throw new Error('speech service unavailable');
  });
  render(<Voice lines={[weDidIt, verdict]} playback={0} />);
  expect(await screen.findByText(verdict.text)).toBeDefined();
  expect(speak).toHaveBeenCalledTimes(2);
  expect(screen.queryByRole('alert')).toBeNull();
});

test('a voice that arrives in a later voice-list update is used', async () => {
  const synth = withSynth([]);
  render(<Voice lines={[weDidIt]} playback={0} />);
  synth.dispatchEvent(new Event('voiceschanged'));
  synth.voices = [voice('en-GB', true)];
  synth.dispatchEvent(new Event('voiceschanged'));
  await vi.waitFor(() => expect(synth.spoken.map((u) => u.text)).toEqual([weDidIt.text]));
});

test('the caption is the text of the line being spoken, a memo under its label', async () => {
  const memo = line('m1', 'More catapult.', 'slow', 'model');
  const synth = withSynth([voice('en-US', true)]);
  render(<Voice lines={[memo, verdict]} playback={0} />);
  await vi.waitFor(() => expect(synth.spoken).toHaveLength(1));
  expect(synth.spoken[0]).toMatchObject({ text: memo.text, rate: 0.8 });
  expect(screen.getByText(memo.text).textContent).toBe(`Memo: ${memo.text}`);
  expect(
    screen.getByText("Mr. Pending speaks with your browser's on-device voice; no line leaves this device."),
  ).toBeDefined();

  synth.end();
  await vi.waitFor(() => expect(synth.spoken).toHaveLength(2));
  expect(screen.getByText(verdict.text).textContent).toBe(verdict.text);
  expect(screen.queryByText(memo.text)).toBeNull();
});

test('Esc skips the line being spoken and the next one follows', async () => {
  const synth = withSynth([voice('en-GB', true)]);
  render(<Voice lines={[weDidIt, verdict]} playback={0} />);
  await vi.waitFor(() => expect(synth.spoken).toHaveLength(1));
  await userEvent.setup().keyboard('{Escape}');
  expect(synth.cancel).toHaveBeenCalledTimes(1);
  await vi.waitFor(() => expect(synth.spoken.map((u) => u.text)).toEqual([weDidIt.text, verdict.text]));
});

test('a silent voice on the same page leaves Esc to the voice that is speaking', async () => {
  const synth = withSynth([voice('en-GB', true)]);
  render(
    <>
      <Voice lines={[]} playback="idle" />
      <Voice lines={[weDidIt, verdict]} playback={0} />
    </>,
  );
  await vi.waitFor(() => expect(synth.spoken).toHaveLength(1));
  await userEvent.setup().keyboard('{Escape}');
  expect(synth.cancel).toHaveBeenCalledTimes(1);
  await vi.waitFor(() => expect(synth.spoken.map((u) => u.text)).toEqual([weDidIt.text, verdict.text]));
});

test('a Mute held above carries over to the voice that replaces this one', async () => {
  const synth = withSynth([voice('en-GB', true)]);
  const user = userEvent.setup();
  function Screen({ playing }: { playing: boolean }) {
    const [muted, setMuted] = useState(false);
    const mute = { muted, setMuted };
    return playing ? (
      <Voice key="recording" lines={[weDidIt]} playback="recording" mute={mute} />
    ) : (
      <Voice key="idle" lines={[]} playback="idle" mute={mute} />
    );
  }
  const { rerender } = render(<Screen playing={false} />);
  await user.click(screen.getByRole('button', { name: 'Mute' }));

  rerender(<Screen playing />);
  expect(screen.getByRole('button', { name: 'Mute' }).getAttribute('aria-pressed')).toBe('true');
  expect(await screen.findByText(weDidIt.text)).toBeDefined();
  expect(synth.spoken).toHaveLength(0);
});

test('a replay stops the line being spoken and hears every line again from the start', async () => {
  const synth = withSynth([voice('en-GB', true)]);
  const { rerender } = render(<Voice lines={[weDidIt, verdict]} playback={0} />);
  await vi.waitFor(() => expect(synth.spoken).toHaveLength(1));
  synth.end();
  await vi.waitFor(() => expect(synth.spoken).toHaveLength(2));

  rerender(<Voice lines={[weDidIt]} playback={1} />);
  expect(synth.cancel).toHaveBeenCalledTimes(1);
  await vi.waitFor(() => expect(synth.spoken).toHaveLength(3));
  expect(synth.spoken[2]?.text).toBe(weDidIt.text);

  // The interrupted verdict of the old playback does not end the replayed line, which still plays to its end.
  rerender(<Voice lines={[weDidIt, verdict]} playback={1} />);
  expect(synth.spoken).toHaveLength(3);
  synth.end();
  await vi.waitFor(() =>
    expect(synth.spoken.map((u) => u.text)).toEqual([weDidIt.text, verdict.text, weDidIt.text, verdict.text]),
  );
});

test('Mute silences the current line and captions the rest until unmuted', async () => {
  const synth = withSynth([voice('en-GB', true)]);
  const user = userEvent.setup();
  const { rerender } = render(<Voice lines={[weDidIt]} playback={0} />);
  await vi.waitFor(() => expect(synth.spoken).toHaveLength(1));
  const mute = screen.getByRole('button', { name: 'Mute' });
  await user.click(mute);
  expect(mute.getAttribute('aria-pressed')).toBe('true');
  expect(synth.cancel).toHaveBeenCalledTimes(1);

  rerender(<Voice lines={[weDidIt, acknowledged]} playback={0} />);
  expect(await screen.findByText(acknowledged.text)).toBeDefined();
  expect(synth.spoken).toHaveLength(1);

  await user.click(mute);
  rerender(<Voice lines={[weDidIt, acknowledged, verdict]} playback={0} />);
  await vi.waitFor(() => expect(synth.spoken.map((u) => u.text)).toEqual([weDidIt.text, verdict.text]));
});
