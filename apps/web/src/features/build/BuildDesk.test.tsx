import { Attempt } from '@pending/contract';
import type { Build, Line, StreamEvent } from '@pending/contract';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, expect, test, vi } from 'vitest';
import engineer from '../engineer/Engineer.module.css';
import panel from './BoardPanel.module.css';
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
// What the Current step note says while Gemma designs, while a trial is tested, and once a press is revealed.
const DESIGNING = 'GEMMA IS DESIGNING A small AI model is drawing a mechanical blueprint.';
const TESTING = 'TESTING THE MACHINE The simulator is checking whether the ball reaches the blue button.';
const WORKED = "IT WORKED Gemma's machine pressed the button. The simulator verified it.";

// The Current step note's indeterminate rule, drawn only while the stage waits for the model.
const waiting = () => document.querySelector(`.${panel.bar}`) !== null;

const prefersReduced = (matches: boolean) =>
  vi.stubGlobal('matchMedia', () => ({ matches, addEventListener() {}, removeEventListener() {} }));

test('before filing Mr. Pending, his bubble, the one button and the idle board share one stage, kept while drafting', async () => {
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
  // His one bubble, beside him, says his introduction and announces what he says next.
  const voice = screen.getByRole('region', { name: 'Voice' });
  expect(rig?.parentElement?.parentElement?.contains(voice)).toBe(true);
  expect(within(voice).getByText(INTRODUCTION).getAttribute('aria-live')).toBe('polite');
  expect(screen.getByRole('status').textContent).toBe('Form 27B/6 awaits filing.');
  expect(waiting()).toBe(false);
  // Voice on and Skip voice under the bubble, and the one button, which files the folded form.
  expect(
    within(voice)
      .getAllByRole('button')
      .map((b) => b.textContent),
  ).toEqual(['Voice on', 'Skip voice']);
  expect(within(voice).getByRole('button', { name: 'Voice on' }).getAttribute('aria-pressed')).toBe('true');
  const button = screen.getByRole<HTMLButtonElement>('button', { name: 'Press the button' });
  const form = screen.getByRole('form', { name: 'Form 27B/6' });
  expect(button.getAttribute('form')).toBe(form.id);
  expect(form.querySelector('details')?.open).toBe(false);
  expect(within(form).queryByRole('button')).toBeNull();
  // The idle board: the model from the config, nothing attempted, every step to do, the result pending, the empty
  // sheet with its caption and the current step in its status; the Minutes and the form folded under it.
  const board = screen.getByRole('region', { name: 'The board' });
  expect(within(board).getByText('Gemma 4 E2B · Ollama · Running locally')).toBeDefined();
  expect(within(board).getByText('Attempt 0 / 6')).toBeDefined();
  const steps = within(board).getByRole('list', { name: 'Steps' });
  expect(
    within(steps)
      .getAllByRole('listitem')
      .map((li) => li.textContent),
  ).toEqual([
    'Designing machine, to do',
    'Running simulation, to do',
    'Result, to do',
    'Repairing design, to do',
    'Testing again, to do',
    'Final result, to do',
  ]);
  const result = within(board).getByRole('region', { name: 'Simulation result' });
  expect(result.querySelector('[data-stamp]')?.textContent).toBe('PENDING');
  const sheet = within(board).getByRole('img', { name: 'The empty board' });
  expect(within(board).getByText('The ridiculous machinery appears here.')).toBeDefined();
  expect(board.contains(screen.getByRole('status'))).toBe(true);
  const minutes = screen.getByText('Minutes').closest('details');
  if (minutes === null) throw new Error('no Minutes fold');
  expect(minutes.open).toBe(false);
  // Advanced settings is the first section under the board, the Minutes after it.
  expect(board.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(form.compareDocumentPosition(minutes) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

  await user.click(button);
  expect(screen.getByRole('status').textContent).toBe(DESIGNING);
  expect(waiting()).toBe(true);
  // The button waits and the form stays folded; the drafting build waits on the very same board, its first step and
  // first trial current.
  expect(button.disabled).toBe(true);
  expect(form.querySelector('details')?.open).toBe(false);
  expect(within(screen.getByRole('region', { name: 'The board' })).getByRole('img')).toBe(sheet);
  expect(steps.querySelector('[aria-current="step"]')?.textContent).toBe('Designing machine, in progress');
  expect(within(board).getByText('Attempt 1 / 6')).toBeDefined();
  // One rig, the very element that stood on the front door.
  expect(document.querySelectorAll('svg[data-variant="desk"]')).toHaveLength(1);
  expect(document.querySelector('svg[data-variant="desk"]')).toBe(rig);

  // Withdrawing stops the wait at once.
  await user.click(screen.getByRole('button', { name: 'Withdraw the form' }));
  expect(waiting()).toBe(false);
});

test('filing moves focus to the status region, which announces progress and then the verdict', async () => {
  // Reduced motion: one tick jumps to the final frame, so playback ends quickly.
  prefersReduced(true);
  let release = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  let filed = 0;
  server.use(
    http.post('*/api/build', async ({ request }) => {
      filed += 1;
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
  await user.click(screen.getByRole('button', { name: 'Press the button' }));

  const status = screen.getByRole('status');
  expect(document.activeElement).toBe(status);
  expect(status.textContent).toBe(DESIGNING);

  release();
  await vi.waitFor(() => expect(screen.getByRole('status').textContent).toBe(WORKED));
  // The result pinned on the board says PRESSED and the verdict; the one button files the form once more and focus
  // returns to the status.
  const result = within(screen.getByRole('region', { name: 'The board' })).getByRole('region', {
    name: 'Simulation result',
  });
  expect(result.querySelector('[data-stamp]')?.textContent).toBe('PRESSED');
  expect(result.textContent).toContain('One button. An extraordinary amount of paperwork.');
  await user.click(screen.getByRole('button', { name: 'Press the button' }));
  expect(document.activeElement).toBe(screen.getByRole('status'));
  await vi.waitFor(() => expect(filed).toBe(2));
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
  await user.click(screen.getByRole('button', { name: 'Press the button' }));

  await vi.waitFor(() => expect(screen.getByRole('status').textContent).toBe(WORKED));
  await vi.waitFor(() => expect(onFinished).toHaveBeenCalledTimes(1));
  expect(onFinished.mock.calls[0]?.[0].title).toBe('The Scenic Route');
  expect(screen.queryByRole('alert')).toBeNull();

  await user.click(screen.getByRole('button', { name: 'Replay' }));
  await vi.waitFor(() => expect(screen.getByRole('status').textContent).toBe(WORKED));
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
  await user.click(screen.getByRole('button', { name: 'Press the button' }));

  const alert = await screen.findByRole('alert');
  expect(alert.textContent).toMatch(/would not keep the build/);
  expect(screen.getByRole('region', { name: 'Simulation result' }).contains(alert)).toBe(true);
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
  await user.click(screen.getByRole('button', { name: 'Press the button' }));
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
  await user.click(screen.getByRole('button', { name: 'Press the button' }));
  await vi.waitFor(() => expect(screen.getByRole('status').textContent).toBe(WORKED));

  // The diff for trial 2 is marked from its patch on trial 2's own board in symbols, and in words in the fold.
  const board = screen.getByRole('img', { name: 'Pressed' });
  expect(board.querySelector('[data-change="removed"] [data-part="p4"]')).not.toBeNull();
  const correction = screen.getByRole('region', { name: 'Correction for trial 2' });
  expect(within(correction).getByRole('listitem').textContent).toBe('Removed catapult p4 at I5.');
  // The trial's board is at its final frame and its minutes hold every event, folded away with the lines.
  expect(board.querySelector('[data-button]')?.getAttribute('data-pressed')).toBe('true');
  const minutes = screen.getByRole('region', { name: 'Minutes of trial 2' });
  expect(minutes.querySelectorAll('li')).toHaveLength(repaired.events.length);
  const fold = minutes.closest('details');
  expect(fold?.open).toBe(false);
  const lines = screen.getByRole('list', { name: 'Mr. Pending' });
  expect(fold?.contains(lines)).toBe(true);
  expect(lines.textContent).toBe('Memo: Less catapult.');
  // The bubble beside his rig, in both its variants, shows the line said last, a memo under its label.
  const voice = screen.getByRole('region', { name: 'Voice' });
  expect(voice.querySelector('[aria-live="polite"]')?.textContent).toBe('Memo: Less catapult.');
  const rigs = voice.parentElement?.parentElement?.querySelectorAll('svg[data-variant]');
  expect([...(rigs ?? [])].map((svg) => svg.getAttribute('data-variant'))).toEqual(['desk', 'phone']);
  // The trials are a selector on the stage, not stacked boards: trial 1 shows its failure on the same board.
  const trials = screen.getByRole('group', { name: 'Trials' });
  const trial = (n: number) => within(trials).getByRole('button', { name: new RegExp(`^Trial ${n},`) });
  // Each reached trial names its outcome, which its dot also shows as a glyph, not by colour alone.
  expect(
    within(trials)
      .getAllByRole('button')
      .map((b) => b.getAttribute('aria-label')),
  ).toEqual(['Trial 1, failed', 'Trial 2, pressed']);
  expect(trials.querySelectorAll('svg')).toHaveLength(2);
  expect(trial(2).getAttribute('aria-pressed')).toBe('true');
  await user.click(trial(1));
  expect(trial(1).getAttribute('aria-pressed')).toBe('true');
  const first = within(screen.getByRole('region', { name: 'The board' })).getByRole('img');
  expect(first).toBe(board);
  expect(first.querySelector('[data-failure]')).not.toBeNull();
  expect(first.querySelector('[data-change]')).toBeNull();
  expect(screen.getByRole('region', { name: 'Minutes of trial 1' })).toBeDefined();
  await user.click(trial(2));

  // Replay stays where it stands on the board, so focus stays on it; the selector follows the playhead from trial 1.
  const replay = within(screen.getByRole('group', { name: 'Playback' })).getByRole('button', {
    name: 'Replay',
  });
  replay.focus();
  await user.keyboard('{Enter}');
  expect(document.activeElement).toBe(replay);
  expect(screen.getByRole('status').textContent).toBe(TESTING);
  expect(trial(1).getAttribute('aria-pressed')).toBe('true');
});

const said = (id: string, beat: Line['beat'], mood: Line['mood'], text: string) => (requestId: string) =>
  ({
    type: 'line',
    requestId,
    line: { id, beat, mood, text, source: 'table', at: { attempt: 1, step: 0 } },
  }) as const;
// The board's own button; the button beside Mr. Pending is the same sprite.
const boardButton = () => screen.getByRole('region', { name: 'The board' }).querySelector('[data-button]');
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
  await user.click(screen.getByRole('button', { name: 'Press the button' }));

  // The build has ended on the press tick; the note keeps the trial until the hard cut reveals the outcome.
  await vi.waitFor(() => expect(boardButton()?.closest('svg')?.getAttribute('data-press')).toBe('sequence'), {
    timeout: 3000,
  });
  expect(screen.getByRole('status').textContent).toBe(TESTING);
  // The pressed lines are all said, but the rig, the board and the report wait for the press clock.
  expect(screen.getByRole('list', { name: 'Mr. Pending' }).textContent).toContain('WE DID IT!');
  expect(mood()).toBe('slow');
  expect(boardButton()?.closest('svg')?.getAttribute('data-press')).toBe('sequence');
  const stamp = () =>
    screen.getByRole('region', { name: 'Simulation result' }).querySelector('[data-stamp]')?.textContent;
  await vi.waitFor(() => expect(mood()).toBe('excited'), { timeout: 1500 });
  expect(stamp()).toBe('PENDING');
  await vi.waitFor(() => expect(mood()).toBe('deadpan'), { timeout: 1500 });
  expect(stamp()).toBe('PRESSED');
  expect(screen.getByRole('status').textContent).toBe(WORKED);
  // Its beats are over by the cut, so the board is left at rest.
  expect(boardButton()?.closest('svg')?.getAttribute('data-press')).toBe('still');
});

test('with reduced motion a press shows its final deadpan at once, with no timed pose before it', async () => {
  vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
  pressedBuild();
  const user = userEvent.setup();
  render(<BuildDesk canFile />);
  await user.click(screen.getByRole('button', { name: 'Press the button' }));

  await vi.waitFor(() => expect(screen.getByRole('status').textContent).toBe(WORKED));
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
  await user.click(screen.getByRole('button', { name: 'Press the button' }));

  // The build has ended on the press tick; the note keeps the trial until the hard cut reveals the outcome.
  await vi.waitFor(() => expect(boardButton()?.closest('svg')?.getAttribute('data-press')).toBe('sequence'), {
    timeout: 3000,
  });
  expect(screen.getByRole('status').textContent).toBe(TESTING);
  expect(mood()).toBe('slow');
  const press = () => boardButton()?.closest('svg')?.getAttribute('data-press');
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
  await user.click(screen.getByRole('button', { name: 'Press the button' }));
  const texts = () => spoken.map((u) => u.text);
  // The first line ends before the press, so the queue is idle when the press tick arrives.
  await vi.waitFor(() => expect(texts()).toEqual(['Commencing trial 1.']));
  spoken[0]?.onend?.();

  // The build has ended on the press tick; the note keeps the trial until the hard cut reveals the outcome.
  await vi.waitFor(() => expect(boardButton()?.closest('svg')?.getAttribute('data-press')).toBe('sequence'), {
    timeout: 3000,
  });
  expect(screen.getByRole('status').textContent).toBe(TESTING);
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
  await user.click(screen.getByRole('button', { name: 'Press the button' }));
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
  const caption = await screen.findByText(title);
  expect(caption.tagName).toBe('P');
  expect(screen.getByRole('region', { name: 'The board' }).contains(caption)).toBe(true);
  expect(screen.getByRole('list', { name: 'Mr. Pending' }).textContent).toBe(`Memo: ${memo}`);
  expect(injected()).toBeNull();

  send((requestId) => ({ type: 'attempt', requestId, attempt }));
  send((requestId) => ({ type: 'done', requestId, header: { ...header([attempt]), title } }));
  await vi.waitFor(() => expect(screen.getByRole('status').textContent).toBe(WORKED));
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
  await user.click(screen.getByRole('button', { name: 'Press the button' }));
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
  // The line said is being spoken.
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

test('a failure stops the line being spoken and clears its caption, and Mute carries over to the retry', async () => {
  prefersReduced(false);
  const { spoken, cancel } = withSynth();
  const send = held();
  const user = userEvent.setup();
  render(<BuildDesk canFile />);
  await user.click(screen.getByRole('button', { name: 'Press the button' }));
  send(said('l1', 'designing', 'slow', 'The Department is drafting.'));
  await vi.waitFor(() => expect(spoken.map((u) => u.text)).toEqual(['The Department is drafting.']));
  const voice = screen.getByRole('region', { name: 'Voice' });
  expect(voice.textContent).toContain('The Department is drafting.');
  expect(cancel).not.toHaveBeenCalled();

  send((requestId) => ({
    type: 'error',
    requestId,
    code: 'TIMEOUT',
    message: 'Gemma took too long to answer. Try again.',
    retryable: true,
  }));
  await screen.findByRole('alert');
  // The note shows the real message and the next step, hidden from the status region that the alert already speaks.
  expect(waiting()).toBe(false);
  const status = screen.getByRole('status');
  expect(status.textContent).toBe('Gemma took too long to answer. Try again. Next: Build again.');
  expect(status.firstElementChild?.getAttribute('aria-hidden')).toBe('true');
  // The voice stops in the effect that follows the error's render.
  await vi.waitFor(() => expect(cancel).toHaveBeenCalledTimes(1));
  expect(voice.textContent).not.toContain('The Department is drafting.');

  // The voice switched off beside the error stays off for the build filed again.
  await user.click(within(voice).getByRole('button', { name: 'Voice on' }));
  await user.click(screen.getByRole('button', { name: 'Build again' }));
  await vi.waitFor(() => expect(screen.getByRole('status').textContent).toBe(DESIGNING));
  expect(within(voice).getByRole('button', { name: 'Voice on' }).getAttribute('aria-pressed')).toBe('false');
});

test('the press clock starts on the tick that reaches button.pressed and runs once, however late done arrives', async () => {
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  const send = held();
  const user = userEvent.setup();
  render(<BuildDesk canFile />);
  await user.click(screen.getByRole('button', { name: 'Press the button' }));
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
  expect(screen.getByRole('status').textContent).toBe(TESTING);

  send((requestId) => ({ type: 'done', requestId, header: header([pressed(1)]) }));
  await vi.waitFor(() => expect(screen.getByRole('status').textContent).toBe(WORKED));
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
  await user.click(screen.getByRole('button', { name: 'Press the button' }));
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

// The one board on the stage, and the ball standing on it.
const sheet = () => within(screen.getByRole('region', { name: 'The board' })).getByRole('img');
const ball = () => sheet().querySelector('[data-ball]');

test('one board through every trial, each trial redrawn on it, never animating out of the previous one', async () => {
  prefersReduced(true);
  const send = held();
  const user = userEvent.setup();
  render(<BuildDesk canFile />);
  const idle = sheet();
  await user.click(screen.getByRole('button', { name: 'Press the button' }));
  send((requestId) => ({ type: 'attempt', requestId, attempt: lost(1) }));
  await screen.findByRole('button', { name: /^Trial 1,/ });
  expect(sheet()).toBe(idle);
  const first = ball();
  expect(first).toBeTruthy();

  send((requestId) => ({ type: 'attempt', requestId, attempt: pressed(2) }));
  await screen.findByRole('button', { name: /^Trial 2,/ });
  expect(sheet()).toBe(idle);
  expect(ball()).toBeTruthy();
  expect(first?.isConnected).toBe(false);
});

test('a done that arrives after the press keeps the same rig, so its sequence is not played again', async () => {
  prefersReduced(true);
  const send = held();
  const user = userEvent.setup();
  render(<BuildDesk canFile />);
  await user.click(screen.getByRole('button', { name: 'Press the button' }));
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
  await vi.waitFor(() => expect(screen.getByRole('status').textContent).toBe(WORKED));
  expect(rig?.isConnected).toBe(true);
});

test('replay starts on a fresh board, never animating the same trial backward', async () => {
  prefersReduced(false);
  const send = held();
  const user = userEvent.setup();
  render(<BuildDesk canFile />);
  await user.click(screen.getByRole('button', { name: 'Press the button' }));
  send((requestId) => ({ type: 'attempt', requestId, attempt: pressed(1) }));
  const playback = await screen.findByRole('group', { name: 'Playback' });
  const board = sheet();
  const before = ball();
  expect(before).toBeTruthy();

  await user.click(within(playback).getByRole('button', { name: 'Replay' }));
  expect(sheet()).toBe(board);
  expect(ball()).toBeTruthy();
  expect(before?.isConnected).toBe(false);
});
