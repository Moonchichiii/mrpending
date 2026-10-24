import { Attempt } from '@pending/contract';
import type { Build, Line, StreamEvent } from '@pending/contract';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, expect, test, vi } from 'vitest';
import engineer from '../engineer/Engineer.module.css';
import { BuildDesk, INTRODUCTION } from './BuildDesk';
import { header, lost, pressed } from './model/testBuild';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterEach(() => {
  server.resetHandlers();
  cleanup();
  vi.unstubAllGlobals();
});
afterAll(() => server.close());

// A media query list the rig can subscribe to, as the build clock and the engineer read it.
const prefersReduced = (matches: boolean) =>
  vi.stubGlobal('matchMedia', () => ({ matches, addEventListener() {}, removeEventListener() {} }));

test('before filing Mr. Pending, his voice, the board button and the idle board share one screen, and the same rig drafts', async () => {
  prefersReduced(false);
  // The agent never answers, so the build stays in drafting until the desk is unmounted.
  server.use(
    http.post('*/api/build', async () => {
      await delay('infinite');
      return new HttpResponse('');
    }),
  );
  const user = userEvent.setup();
  render(
    <BuildDesk
      canFile
      config={{ inference: 'this-machine', model: { mode: 'local', id: 'gemma4:e2b', host: 'ollama' } }}
    />,
  );

  const rig = document.querySelector('svg[data-variant="desk"]');
  expect(rig?.classList.contains(engineer.slow ?? '')).toBe(true);
  expect(document.querySelectorAll('svg[data-variant="phone"]')).toHaveLength(1);
  const card = rig?.parentElement?.parentElement;
  expect(card?.textContent).toBe(INTRODUCTION);
  expect(screen.getByRole('status').textContent).toBe('Form 27B/6 awaits filing.');
  // The voice and the one button, the board's own sprite, which files the form folded away under the board.
  expect(
    within(screen.getByRole('region', { name: 'Voice' }))
      .getAllByRole('button')
      .map((b) => b.textContent),
  ).toEqual(['Mute', 'Skip voice']);
  const button = screen.getByRole('button', { name: 'Ask Mr. Pending to press it' });
  expect(button.querySelector('[data-button]')).not.toBeNull();
  const form = screen.getByRole('form', { name: 'Form 27B/6' });
  expect(button.getAttribute('form')).toBe(form.id);
  expect(form.querySelector('details')?.open).toBe(false);
  expect(within(form).queryByRole('button')).toBeNull();
  // The idle board: the model from the config, the empty sheet, one caption and the level line, above the fold.
  const board = screen.getByRole('region', { name: 'The board' });
  expect(within(board).getByText('Gemma 4 E2B · Ollama · this machine')).toBeDefined();
  expect(within(board).getByRole('img', { name: 'The empty board' })).toBeDefined();
  expect(within(board).getByText('The ridiculous machinery appears here.')).toBeDefined();
  expect(within(board).getByText('Gemma designs → Simulator tests → Gemma repairs')).toBeDefined();
  expect(board.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

  await user.click(button);
  expect(screen.getByRole('status').textContent).toBe('Drafting. Please do not rush the Department.');
  expect(screen.queryByRole('form', { name: 'Form 27B/6' })).toBeNull();
  // The drafting build waits on the same board.
  expect(within(screen.getByRole('region', { name: 'The board' })).getByRole('img')).toBeDefined();
  // One rig, the very element that stood on the front door.
  expect(document.querySelectorAll('svg[data-variant="desk"]')).toHaveLength(1);
  expect(document.querySelector('svg[data-variant="desk"]')).toBe(rig);
});

test('filing moves focus to the status region, which announces progress and then the verdict', async () => {
  // Reduced motion: one tick jumps to the final frame, so playback ends quickly.
  prefersReduced(true);
  let release = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  server.use(
    http.post('*/api/build', async ({ request }) => {
      const requestId = request.headers.get('x-request-id') ?? '';
      const events: StreamEvent[] = [
        { type: 'attempt', requestId, attempt: pressed(1) },
        { type: 'done', requestId, header: header([pressed(1)]) },
      ];
      await held;
      return new HttpResponse(events.map((e) => `${JSON.stringify(e)}\n`).join(''));
    }),
  );
  const user = userEvent.setup();
  render(<BuildDesk canFile />);
  await user.click(screen.getByRole('button', { name: 'Ask Mr. Pending to press it' }));

  const status = screen.getByRole('status');
  expect(document.activeElement).toBe(status);
  expect(status.textContent).toBe('Drafting. Please do not rush the Department.');

  release();
  await vi.waitFor(() =>
    expect(screen.getByRole('status').textContent).toBe('One button. An extraordinary amount of paperwork.'),
  );
  await user.click(screen.getByRole('button', { name: 'File another form' }));
  expect(document.activeElement).toBe(screen.getByRole('status'));
  // The filed form comes back for the next one.
  expect(screen.getByLabelText<HTMLTextAreaElement>('1. Nature of the request').value).toBe(
    header([pressed(1)]).form.nature,
  );
});

// Answers a filing with the given stream events, each stamped with the request's id.
const stream = (events: ((requestId: string) => StreamEvent)[]) =>
  server.use(
    http.post('*/api/build', ({ request }) => {
      const requestId = request.headers.get('x-request-id') ?? '';
      return new HttpResponse(events.map((e) => `${JSON.stringify(e(requestId))}\n`).join(''));
    }),
  );

test('a build that ends is reported once with its build, however often it is replayed', async () => {
  prefersReduced(true);
  stream([
    (requestId) => ({ type: 'attempt', requestId, attempt: pressed(1) }),
    (requestId) => ({ type: 'done', requestId, header: header([pressed(1)]) }),
  ]);
  const onFinished = vi.fn<(build: Build) => boolean>(() => true);
  const user = userEvent.setup();
  render(<BuildDesk canFile onFinished={onFinished} />);
  await user.click(screen.getByRole('button', { name: 'Ask Mr. Pending to press it' }));

  const verdict = 'One button. An extraordinary amount of paperwork.';
  await vi.waitFor(() => expect(screen.getByRole('status').textContent).toBe(verdict));
  await vi.waitFor(() => expect(onFinished).toHaveBeenCalledTimes(1));
  expect(onFinished.mock.calls[0]?.[0].title).toBe('The Scenic Route');
  expect(screen.queryByRole('alert')).toBeNull();

  await user.click(screen.getByRole('button', { name: 'Replay from the start' }));
  await vi.waitFor(() => expect(screen.getByRole('status').textContent).toBe(verdict));
  expect(onFinished).toHaveBeenCalledTimes(1);
});

test('a build the callback did not keep says so at its ending instead of vanishing from My department', async () => {
  prefersReduced(true);
  stream([
    (requestId) => ({ type: 'attempt', requestId, attempt: pressed(1) }),
    (requestId) => ({ type: 'done', requestId, header: header([pressed(1)]) }),
  ]);
  const user = userEvent.setup();
  render(<BuildDesk canFile onFinished={() => false} />);
  await user.click(screen.getByRole('button', { name: 'Ask Mr. Pending to press it' }));

  expect((await screen.findByRole('alert')).textContent).toMatch(/would not keep the build/);
  await user.click(screen.getByRole('button', { name: 'File another form' }));
  expect(screen.queryByRole('alert')).toBeNull();
});

test('every playback control is a button operated from the keyboard, and speed sets the step duration', async () => {
  prefersReduced(false);
  // A pressed attempt on a stream held open waits at its last step for done, so the controls stay.
  server.use(
    http.post('*/api/build', ({ request }) => {
      const requestId = request.headers.get('x-request-id') ?? '';
      const event: StreamEvent = { type: 'attempt', requestId, attempt: pressed(1) };
      const body = new ReadableStream({
        start: (controller) => controller.enqueue(new TextEncoder().encode(`${JSON.stringify(event)}\n`)),
      });
      return new HttpResponse(body);
    }),
  );
  const user = userEvent.setup();
  render(<BuildDesk canFile />);
  await user.click(screen.getByRole('button', { name: 'Ask Mr. Pending to press it' }));
  const playback = await screen.findByRole('group', { name: 'Playback' });
  const control = (name: string) => within(playback).getByRole('button', { name });
  const pace = () => screen.getByRole('img', { name: 'Pressed' }).getAttribute('data-pace');
  expect(pace()).toBe('120');

  control('Pause').focus();
  await user.keyboard(' ');
  expect(control('Pause').getAttribute('aria-pressed')).toBe('true');
  const minutes = () =>
    screen.getByRole('region', { name: 'Minutes of trial 1' }).querySelectorAll('li').length;
  const held = minutes();
  await new Promise((resolve) => setTimeout(resolve, 400));
  expect(minutes()).toBe(held);

  const speeds: [string, string][] = [
    ['0.5×', '240'],
    ['1×', '120'],
    ['Impatient', '40'],
  ];
  for (const [name, ms] of speeds) {
    control(name).focus();
    await user.keyboard('{Enter}');
    expect(control(name).getAttribute('aria-pressed')).toBe('true');
    expect(pace()).toBe(ms);
  }

  control('Pause').focus();
  await user.keyboard('{Enter}');
  await vi.waitFor(() => expect(minutes()).toBe(pressed(1).events.length), { timeout: 3000 });
  control('Replay').focus();
  await user.keyboard('{Enter}');
  expect(minutes()).toBeLessThan(pressed(1).events.length);
  // Skip voice belongs to the voice control, not to playback.
  expect(within(playback).queryByRole('button', { name: 'Skip voice' })).toBeNull();
  const voice = screen.getByRole('region', { name: 'Voice' });
  expect(within(voice).getByRole('button', { name: 'Skip voice' })).toBeTruthy();
});

test('reduced motion: final frames, the full minutes, the correction diff and the lines, without movement', async () => {
  prefersReduced(true);
  const repaired = Attempt.parse({ ...pressed(2), patch: [{ op: 'remove', id: 'p4' }] });
  stream([
    (requestId) => ({ type: 'attempt', requestId, attempt: lost(1) }),
    (requestId) => ({
      type: 'line',
      requestId,
      line: {
        id: 'm2',
        beat: 'repaired',
        mood: 'slow',
        text: 'Less catapult.',
        source: 'model',
        at: { attempt: 2, step: 0 },
      },
    }),
    (requestId) => ({ type: 'attempt', requestId, attempt: repaired }),
    (requestId) => ({ type: 'done', requestId, header: header([lost(1), repaired]) }),
  ]);
  const user = userEvent.setup();
  render(<BuildDesk canFile />);
  await user.click(screen.getByRole('button', { name: 'Ask Mr. Pending to press it' }));
  await vi.waitFor(() =>
    expect(screen.getByRole('status').textContent).toBe('One button. An extraordinary amount of paperwork.'),
  );

  // The diff for trial 2 is drawn from its patch over trial 1's board, in symbols and in words.
  const correction = screen.getByRole('img', { name: 'Correction for trial 2' });
  expect(correction.querySelector('[data-change="removed"] [data-part="p4"]')).not.toBeNull();
  const figure = correction.closest('figure');
  if (!figure) throw new Error('the correction is not a figure');
  expect(within(figure).getByRole('listitem').textContent).toBe('Removed catapult p4 at I5.');
  // The trial's board is at its final frame and its minutes hold every event.
  const board = screen.getByRole('img', { name: 'Pressed' });
  expect(board.querySelector('[data-button]')?.getAttribute('data-pressed')).toBe('true');
  const minutes = screen.getByRole('region', { name: 'Minutes of trial 2' });
  expect(minutes.querySelectorAll('li')).toHaveLength(repaired.events.length);
  // Mr. Pending's lines are a polite live region; a memo is labelled as one.
  const lines = screen.getByRole('list', { name: 'Mr. Pending' });
  expect(lines.getAttribute('aria-live')).toBe('polite');
  expect(lines.textContent).toBe('Memo: Less catapult.');
  // They sit on Mr. Pending's line card, beside his rig in both its variants.
  const card = lines.parentElement?.parentElement;
  const rigs = card?.querySelectorAll('svg[data-variant]');
  expect([...(rigs ?? [])].map((svg) => svg.getAttribute('data-variant'))).toEqual(['desk', 'phone']);

  // Replaying from the keyboard moves focus to the status, never onto the control that takes the button's place.
  screen.getByRole('button', { name: 'Replay from the start' }).focus();
  await user.keyboard('{Enter}');
  expect(document.activeElement).toBe(screen.getByRole('status'));
  expect(screen.getByRole('status').textContent).toBe('Trial 1 in progress.');
});

const said = (id: string, beat: Line['beat'], mood: Line['mood'], text: string) => (requestId: string) =>
  ({
    type: 'line',
    requestId,
    line: { id, beat, mood, text, source: 'table', at: { attempt: 1, step: 0 } },
  }) as const;
const mood = () => {
  const svg = document.querySelector('svg[data-variant="desk"]');
  return (['slow', 'excited', 'deadpan'] as const).find((m) => svg?.classList.contains(engineer[m] ?? ''));
};

const pressedBuild = () =>
  stream([
    said('l1', 'running', 'slow', 'Commencing trial 1.'),
    (requestId) => ({ type: 'attempt', requestId, attempt: pressed(1) }),
    said('l2', 'pressed', 'excited', 'WE DID IT! Please inform the entire Department.'),
    said('l3', 'pressed', 'deadpan', 'The Department acknowledges this development.'),
    said('l4', 'pressed', 'deadpan', 'One button. An extraordinary amount of paperwork.'),
    (requestId) => ({ type: 'done', requestId, header: header([pressed(1)]) }),
  ]);

test('a press keeps the rig, goes excited at 0.90 s and cuts to deadpan at 1.60 s, though every line is said', async () => {
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  pressedBuild();
  const user = userEvent.setup();
  render(<BuildDesk canFile />);
  await user.click(screen.getByRole('button', { name: 'Ask Mr. Pending to press it' }));

  await vi.waitFor(
    () =>
      expect(screen.getByRole('status').textContent).toBe(
        'One button. An extraordinary amount of paperwork.',
      ),
    { timeout: 3000 },
  );
  // The pressed lines are all said, but the rig, the board and the report wait for the press clock.
  expect(screen.getByRole('list', { name: 'Mr. Pending' }).textContent).toContain('WE DID IT!');
  expect(mood()).toBe('slow');
  expect(document.querySelector('[data-button]')?.closest('svg')?.getAttribute('data-press')).toBe(
    'sequence',
  );
  const report = () => screen.queryByRole('region', { name: 'Engineering Report' });
  await vi.waitFor(() => expect(mood()).toBe('excited'), { timeout: 1500 });
  expect(report()).toBeNull();
  await vi.waitFor(() => expect(mood()).toBe('deadpan'), { timeout: 1500 });
  expect(report()).not.toBeNull();
  // Its beats are over by the cut, so the board is left at rest.
  expect(document.querySelector('[data-button]')?.closest('svg')?.getAttribute('data-press')).toBe('still');
});

test('with reduced motion a press shows its final deadpan at once, with no timed pose before it', async () => {
  vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
  pressedBuild();
  const user = userEvent.setup();
  render(<BuildDesk canFile />);
  await user.click(screen.getByRole('button', { name: 'Ask Mr. Pending to press it' }));

  await vi.waitFor(() =>
    expect(screen.getByRole('status').textContent).toBe('One button. An extraordinary amount of paperwork.'),
  );
  expect(mood()).toBe('deadpan');
  await new Promise((resolve) => setTimeout(resolve, 1000));
  expect(mood()).toBe('deadpan');
});

test('reduced motion switched on during a press cuts to the final deadpan at once and cancels the timed poses', async () => {
  const motion = {
    matches: false,
    onchange: null as (() => void) | null,
    addEventListener() {},
    removeEventListener() {},
  };
  vi.stubGlobal('matchMedia', () => motion);
  pressedBuild();
  const user = userEvent.setup();
  render(<BuildDesk canFile />);
  await user.click(screen.getByRole('button', { name: 'Ask Mr. Pending to press it' }));

  await vi.waitFor(
    () =>
      expect(screen.getByRole('status').textContent).toBe(
        'One button. An extraordinary amount of paperwork.',
      ),
    { timeout: 3000 },
  );
  expect(mood()).toBe('slow');
  const press = () => document.querySelector('[data-button]')?.closest('svg')?.getAttribute('data-press');
  expect(press()).toBe('sequence');
  motion.matches = true;
  act(() => motion.onchange?.());
  expect(mood()).toBe('deadpan');
  // The board is left at rest, so the media rule is not what holds its beats still.
  expect(press()).toBe('still');
  // The timers are cancelled, so the excited pose never comes, and allowing motion again does not run the press back.
  motion.matches = false;
  await new Promise((resolve) => setTimeout(resolve, 1800));
  expect(mood()).toBe('deadpan');
  expect(press()).toBe('still');
});

test('the voice speaks "WE DID IT!" at the excited cue, not on the press tick, and the verdict after it', async () => {
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  const { spoken } = withSynth();
  pressedBuild();
  const user = userEvent.setup();
  render(<BuildDesk canFile />);
  await user.click(screen.getByRole('button', { name: 'Ask Mr. Pending to press it' }));
  const texts = () => spoken.map((u) => u.text);
  // The first line ends before the press, so the queue is idle when the press tick arrives.
  await vi.waitFor(() => expect(texts()).toEqual(['Commencing trial 1.']));
  spoken[0]?.onend?.();

  await vi.waitFor(
    () =>
      expect(screen.getByRole('status').textContent).toBe(
        'One button. An extraordinary amount of paperwork.',
      ),
    { timeout: 3000 },
  );
  const voice = screen.getByRole('region', { name: 'Voice' });
  expect(mood()).toBe('slow');
  expect(texts()).toEqual(['Commencing trial 1.']);
  expect(voice.textContent).not.toContain('WE DID IT!');
  await vi.waitFor(() => expect(mood()).toBe('excited'), { timeout: 1500 });
  await vi.waitFor(() => expect(texts().at(-1)).toBe('WE DID IT! Please inform the entire Department.'));
  expect(voice.textContent).toContain('WE DID IT!');
  // The queue plays the rest in order as each line ends, whatever the clock says.
  spoken.at(-1)?.onend?.();
  await vi.waitFor(() => expect(texts().at(-1)).toBe('The Department acknowledges this development.'));
  spoken.at(-1)?.onend?.();
  await vi.waitFor(() =>
    expect(texts()).toEqual([
      'Commencing trial 1.',
      'WE DID IT! Please inform the entire Department.',
      'The Department acknowledges this development.',
      'One button. An extraordinary amount of paperwork.',
    ]),
  );
});

// Answers a filing with a stream the test writes to and never closes.
const held = () => {
  const encoder = new TextEncoder();
  let write: (event: (requestId: string) => StreamEvent) => void = () => {};
  server.use(
    http.post('*/api/build', ({ request }) => {
      const requestId = request.headers.get('x-request-id') ?? '';
      const body = new ReadableStream<Uint8Array>({
        start: (controller) => {
          write = (event) => controller.enqueue(encoder.encode(`${JSON.stringify(event(requestId))}\n`));
        },
      });
      return new HttpResponse(body);
    }),
  );
  return (event: (requestId: string) => StreamEvent) => write(event);
};

test('markup in a model title or memo is shown as text, while streaming and once the build is done', async () => {
  vi.stubGlobal('matchMedia', () => ({ matches: true }));
  const title = '<img data-injected onerror=alert() src>';
  const memo = '<script data-injected>alert(1)</script>';
  const injected = () => document.querySelector('[data-injected], script, img');
  const attempt = Attempt.parse({ ...pressed(1), blueprint: { ...pressed(1).blueprint, title } });
  const send = held();
  const user = userEvent.setup();
  render(<BuildDesk canFile />);
  await user.click(screen.getByRole('button', { name: 'Ask Mr. Pending to press it' }));
  send((requestId) => ({ type: 'partial', requestId, blueprint: { title } }));
  send((requestId) => ({
    type: 'line',
    requestId,
    line: {
      id: 'm1',
      beat: 'designed',
      mood: 'slow',
      text: memo,
      source: 'model',
      at: { attempt: 1, step: 0 },
    },
  }));
  // The drafting title captions the board that waits for it.
  expect((await screen.findByText(title)).tagName).toBe('FIGCAPTION');
  expect(screen.getByRole('list', { name: 'Mr. Pending' }).textContent).toBe(`Memo: ${memo}`);
  expect(injected()).toBeNull();

  send((requestId) => ({ type: 'attempt', requestId, attempt }));
  send((requestId) => ({ type: 'done', requestId, header: { ...header([attempt]), title } }));
  await vi.waitFor(() =>
    expect(screen.getByRole('status').textContent).toBe('One button. An extraordinary amount of paperwork.'),
  );
  expect(screen.getByRole('img', { name: title })).toBeTruthy();
  expect(screen.getByRole('list', { name: 'Mr. Pending' }).textContent).toBe(`Memo: ${memo}`);
  expect(injected()).toBeNull();
});

// Just the surface of the Web Speech API the voice uses: one on-device voice, and speech starts when queued.
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
const withSynth = () => {
  const spoken: FakeUtterance[] = [];
  const local = { name: 'en-GB', lang: 'en-GB', localService: true, default: false, voiceURI: 'en-GB' };
  const synth = Object.assign(new EventTarget(), {
    getVoices: () => [local],
    speak: (utterance: FakeUtterance) => {
      spoken.push(utterance);
      utterance.onstart?.();
    },
    cancel: vi.fn<() => void>(() => spoken.at(-1)?.onerror?.({ error: 'interrupted' })),
  });
  vi.stubGlobal('speechSynthesis', synth);
  vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance);
  return { spoken, cancel: synth.cancel };
};

test('Space pauses from anywhere but a control, which keeps its own Space, and Escape skips voice once', async () => {
  prefersReduced(false);
  const { spoken, cancel } = withSynth();
  const send = held();
  const user = userEvent.setup();
  render(<BuildDesk canFile />);
  await user.click(screen.getByRole('button', { name: 'Ask Mr. Pending to press it' }));
  send((requestId) => ({
    type: 'line',
    requestId,
    line: {
      id: 'l1',
      beat: 'designing',
      mood: 'slow',
      text: 'The Department is drafting.',
      source: 'table',
      at: { attempt: 1, step: 0 },
    },
  }));
  send((requestId) => ({ type: 'attempt', requestId, attempt: pressed(1) }));
  // The rig is drawn in the card that holds the lines, and the line said is being spoken.
  const lines = await screen.findByRole('list', { name: 'Mr. Pending' });
  expect(lines.parentElement?.parentElement?.querySelector('svg[data-variant="desk"]')).not.toBeNull();
  await vi.waitFor(() => expect(spoken.map((u) => u.text)).toEqual(['The Department is drafting.']));
  const playback = await screen.findByRole('group', { name: 'Playback' });
  const pause = within(playback).getByRole('button', { name: 'Pause' });

  // Focus sits on the status region after filing, which is not a control.
  expect(document.activeElement).toBe(screen.getByRole('status'));
  await user.keyboard(' ');
  expect(pause.getAttribute('aria-pressed')).toBe('true');
  await user.keyboard(' ');
  expect(pause.getAttribute('aria-pressed')).toBe('false');
  // Holding Space toggles once, however often the key repeats.
  await user.keyboard('[Space>4/]');
  expect(pause.getAttribute('aria-pressed')).toBe('true');
  await user.keyboard(' ');

  // On the Pause button, Space activates it exactly once.
  pause.focus();
  await user.keyboard(' ');
  expect(pause.getAttribute('aria-pressed')).toBe('true');

  // Esc is handled by the voice alone, so the line is skipped once, not once per listener.
  await user.keyboard('{Escape}');
  expect(cancel).toHaveBeenCalledTimes(1);
});

test('the press clock starts on the tick that reaches button.pressed and runs once, however late done arrives', async () => {
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  const send = held();
  const user = userEvent.setup();
  render(<BuildDesk canFile />);
  await user.click(screen.getByRole('button', { name: 'Ask Mr. Pending to press it' }));
  send(said('l1', 'running', 'slow', 'Commencing trial 1.'));
  send((requestId) => ({ type: 'attempt', requestId, attempt: pressed(1) }));
  await vi.waitFor(
    () => expect(document.querySelector('[data-button][data-pressed="true"]')).not.toBeNull(),
    {
      timeout: 3000,
    },
  );
  send(said('l2', 'pressed', 'excited', 'WE DID IT! Please inform the entire Department.'));
  send(said('l3', 'pressed', 'deadpan', 'One button. An extraordinary amount of paperwork.'));

  // The header has not come, so playback waits at the press while the rig runs its sequence.
  await vi.waitFor(() => expect(mood()).toBe('excited'), { timeout: 1500 });
  await vi.waitFor(() => expect(mood()).toBe('deadpan'), { timeout: 1500 });
  expect(screen.getByRole('status').textContent).toBe('Trial 1 in progress.');

  send((requestId) => ({ type: 'done', requestId, header: header([pressed(1)]) }));
  await vi.waitFor(() =>
    expect(screen.getByRole('status').textContent).toBe('One button. An extraordinary amount of paperwork.'),
  );
  expect(mood()).toBe('deadpan');
});

const terminal = (attempt: Attempt) => attempt.events.at(-1)?.step ?? 0;

test.each([
  ['the first failure', [lost(1)], 1, true],
  // A record can place the cameo line on a pressed trial or on a later failure; the line shows, the sloth does not.
  ['a pressed trial', [pressed(1)], 1, false],
  ['a second failure', [lost(1), lost(2)], 2, false],
] as const)('the cameo line on %s brings the sloth: %s', async (_, attempts, on, sloth) => {
  prefersReduced(true);
  const send = held();
  const user = userEvent.setup();
  render(<BuildDesk canFile />);
  await user.click(screen.getByRole('button', { name: 'Ask Mr. Pending to press it' }));
  const text = 'This is why we employ snails.';
  const step = terminal(attempts[on - 1] ?? lost(1));
  send((requestId) => ({
    type: 'line',
    requestId,
    line: { id: 'c1', beat: 'cameo', mood: 'deadpan', text, source: 'table', at: { attempt: on, step } },
  }));
  for (const attempt of attempts) send((requestId) => ({ type: 'attempt', requestId, attempt }));

  await vi.waitFor(() => expect(screen.getByRole('list', { name: 'Mr. Pending' }).textContent).toBe(text));
  expect(document.querySelector('[data-sloth]') !== null).toBe(sloth);
});

test('each trial starts on a fresh board, never animating out of the previous one', async () => {
  prefersReduced(true);
  const send = held();
  const user = userEvent.setup();
  render(<BuildDesk canFile />);
  await user.click(screen.getByRole('button', { name: 'Ask Mr. Pending to press it' }));
  send((requestId) => ({ type: 'attempt', requestId, attempt: lost(1) }));
  const board = (n: number) => screen.getByText(`Trial ${n}`).closest('figure')?.querySelector('svg');
  await screen.findByText('Trial 1');
  const first = board(1);
  expect(first).toBeTruthy();

  send((requestId) => ({ type: 'attempt', requestId, attempt: pressed(2) }));
  await screen.findByText('Trial 2');
  expect(board(2)).toBeTruthy();
  expect(first?.isConnected).toBe(false);
});

test('a done that arrives after the press keeps the same rig, so its sequence is not played again', async () => {
  prefersReduced(true);
  const send = held();
  const user = userEvent.setup();
  render(<BuildDesk canFile />);
  await user.click(screen.getByRole('button', { name: 'Ask Mr. Pending to press it' }));
  send((requestId) => ({ type: 'attempt', requestId, attempt: pressed(1) }));
  // A pressed attempt played to its last step waits for done, its card on the running desk.
  await vi.waitFor(() =>
    expect(
      screen
        .getByRole('img', { name: 'Pressed' })
        .querySelector('[data-button]')
        ?.getAttribute('data-pressed'),
    ).toBe('true'),
  );
  const rig = document.querySelector('svg[data-variant="desk"]');
  expect(rig).toBeTruthy();

  send((requestId) => ({ type: 'done', requestId, header: header([pressed(1)]) }));
  await vi.waitFor(() =>
    expect(screen.getByRole('status').textContent).toBe('One button. An extraordinary amount of paperwork.'),
  );
  expect(rig?.isConnected).toBe(true);
});

test('replay starts on a fresh board, never animating the same trial backward', async () => {
  prefersReduced(false);
  const send = held();
  const user = userEvent.setup();
  render(<BuildDesk canFile />);
  await user.click(screen.getByRole('button', { name: 'Ask Mr. Pending to press it' }));
  send((requestId) => ({ type: 'attempt', requestId, attempt: pressed(1) }));
  const playback = await screen.findByRole('group', { name: 'Playback' });
  const board = () => screen.getByText('Trial 1').closest('figure')?.querySelector('svg');
  const before = board();
  expect(before).toBeTruthy();

  await user.click(within(playback).getByRole('button', { name: 'Replay' }));
  expect(board()).toBeTruthy();
  expect(before?.isConnected).toBe(false);
});
