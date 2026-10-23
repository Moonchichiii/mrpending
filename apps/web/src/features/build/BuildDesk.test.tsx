import { Attempt } from '@pending/contract';
import type { Build, StreamEvent } from '@pending/contract';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, expect, test, vi } from 'vitest';
import { BuildDesk } from './BuildDesk';
import { header, lost, pressed } from './model/testBuild';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterEach(() => {
  server.resetHandlers();
  cleanup();
  vi.unstubAllGlobals();
});
afterAll(() => server.close());

test('filing moves focus to the status region, which announces progress and then the verdict', async () => {
  // Reduced motion: one tick jumps to the final frame, so playback ends quickly.
  vi.stubGlobal('matchMedia', () => ({ matches: true }));
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
  await user.click(screen.getByRole('button', { name: 'File Form 27B/6' }));

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
  vi.stubGlobal('matchMedia', () => ({ matches: true }));
  stream([
    (requestId) => ({ type: 'attempt', requestId, attempt: pressed(1) }),
    (requestId) => ({ type: 'done', requestId, header: header([pressed(1)]) }),
  ]);
  const onFinished = vi.fn<(build: Build) => boolean>(() => true);
  const user = userEvent.setup();
  render(<BuildDesk canFile onFinished={onFinished} />);
  await user.click(screen.getByRole('button', { name: 'File Form 27B/6' }));

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
  vi.stubGlobal('matchMedia', () => ({ matches: true }));
  stream([
    (requestId) => ({ type: 'attempt', requestId, attempt: pressed(1) }),
    (requestId) => ({ type: 'done', requestId, header: header([pressed(1)]) }),
  ]);
  const user = userEvent.setup();
  render(<BuildDesk canFile onFinished={() => false} />);
  await user.click(screen.getByRole('button', { name: 'File Form 27B/6' }));

  expect((await screen.findByRole('alert')).textContent).toMatch(/would not keep the build/);
  await user.click(screen.getByRole('button', { name: 'File another form' }));
  expect(screen.queryByRole('alert')).toBeNull();
});

test('every playback control is a button operated from the keyboard, and speed sets the step duration', async () => {
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
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
  await user.click(screen.getByRole('button', { name: 'File Form 27B/6' }));
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
  expect(control('Skip voice')).toBeTruthy();
});

test('reduced motion: final frames, the full minutes, the correction diff and the lines, without movement', async () => {
  vi.stubGlobal('matchMedia', () => ({ matches: true }));
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
  await user.click(screen.getByRole('button', { name: 'File Form 27B/6' }));
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

  // Replaying from the keyboard moves focus to the status, never onto the control that takes the button's place.
  screen.getByRole('button', { name: 'Replay from the start' }).focus();
  await user.keyboard('{Enter}');
  expect(document.activeElement).toBe(screen.getByRole('status'));
  expect(screen.getByRole('status').textContent).toBe('Trial 1 in progress.');
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

test('Space pauses from anywhere but a control, which keeps its own Space, and Escape skips voice', async () => {
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
  const cancel = vi.fn<() => void>();
  vi.stubGlobal('speechSynthesis', { cancel });
  const send = held();
  const user = userEvent.setup();
  render(<BuildDesk canFile />);
  await user.click(screen.getByRole('button', { name: 'File Form 27B/6' }));
  send((requestId) => ({ type: 'attempt', requestId, attempt: pressed(1) }));
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

  await user.keyboard('{Escape}');
  expect(cancel).toHaveBeenCalledTimes(1);
});

test('each trial starts on a fresh board, never animating out of the previous one', async () => {
  vi.stubGlobal('matchMedia', () => ({ matches: true }));
  const send = held();
  const user = userEvent.setup();
  render(<BuildDesk canFile />);
  await user.click(screen.getByRole('button', { name: 'File Form 27B/6' }));
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

test('replay starts on a fresh board, never animating the same trial backward', async () => {
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
  const send = held();
  const user = userEvent.setup();
  render(<BuildDesk canFile />);
  await user.click(screen.getByRole('button', { name: 'File Form 27B/6' }));
  send((requestId) => ({ type: 'attempt', requestId, attempt: pressed(1) }));
  const playback = await screen.findByRole('group', { name: 'Playback' });
  const board = () => screen.getByText('Trial 1').closest('figure')?.querySelector('svg');
  const before = board();
  expect(before).toBeTruthy();

  await user.click(within(playback).getByRole('button', { name: 'Replay' }));
  expect(board()).toBeTruthy();
  expect(before?.isConnected).toBe(false);
});
