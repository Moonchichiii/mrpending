import type { StreamEvent } from '@pending/contract';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest';
import { CONFIG_TIMEOUT_MS } from './features/build/InferenceBadge';
import { header, pressed } from './features/build/model/testBuild';
import { LocalFrontDoor } from './LocalFrontDoor';

// The static archive is always served; each test adds the agent it needs.
const server = setupServer(http.get('*/gallery/:file', () => new HttpResponse(null, { status: 404 })));
beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
beforeEach(() => localStorage.clear());
afterEach(() => {
  server.resetHandlers();
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
afterAll(() => server.close());

const CONFIG = {
  inference: 'this-machine',
  model: { mode: 'local', id: 'gemma4:e2b', host: 'ollama' },
  voice: { elevenlabs: false },
  telemetry: false,
  repairs: 5,
  contractVersion: 'c1',
  rulesVersion: 'r2',
};
const BADGE = 'Gemma runs on this machine. Your prompts stay here.';
const UNCONFIRMED = /The Department has not confirmed where drafting happens/;

// Every build request is counted: none may leave before the badge is shown.
function countBuilds() {
  const builds = { count: 0 };
  server.use(
    http.post('*/api/build', () => {
      builds.count += 1;
      return HttpResponse.json(
        { code: 'MODEL_UNAVAILABLE', message: 'No model.', requestId: 'x', retryable: true },
        { status: 503 },
      );
    }),
  );
  return builds;
}

const fileButton = () => screen.getByRole<HTMLButtonElement>('button', { name: 'Press the button' });
const nature = () => screen.getByLabelText<HTMLTextAreaElement>('1. Nature of the request');
const adjust = (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByText(/^Advanced settings - /));

test('filing stays disabled while /api/config has not answered, and opens with the badge', async () => {
  let answer = () => {};
  const answered = new Promise<void>((resolve) => (answer = resolve));
  server.use(
    http.get('*/api/config', async () => {
      await answered;
      return HttpResponse.json(CONFIG);
    }),
  );
  const builds = countBuilds();
  const user = userEvent.setup();
  render(<LocalFrontDoor />);

  await adjust(user);
  await user.clear(nature());
  await user.type(nature(), 'A scenic route, please.');
  expect(nature().value).toBe('A scenic route, please.');
  expect(fileButton().disabled).toBe(true);
  // Enter in a field is implicit submission; it must not file either.
  await user.type(screen.getByLabelText('2. Fewest parts'), '{Enter}');
  expect(screen.queryByText(BADGE)).toBeNull();
  expect(builds.count).toBe(0);
  // The board names no model until the config does.
  const board = screen.getByRole('region', { name: 'The board' });
  expect(within(board).queryByText(/Ollama/)).toBeNull();
  expect(within(board).getByText('Model not confirmed')).toBeDefined();
  // Until the config answers, the note says the Department's equipment is being checked.
  expect(screen.getByRole('status').textContent).toBe(
    "Checking the Department's equipment Confirming the model on this machine.",
  );

  answer();
  expect(await screen.findByText(BADGE)).toBeDefined();
  expect(screen.getByRole('status').textContent).toBe('Form 27B/6 awaits filing.');
  expect(within(board).getByText('Gemma 4 E2B · Ollama · Running locally')).toBeDefined();
  expect(fileButton().disabled).toBe(false);
  await user.click(fileButton());
  await vi.waitFor(() => expect(builds.count).toBe(1));
});

test('a failed /api/config says so in character, keeps the form usable and can be asked again', async () => {
  let fail = true;
  server.use(
    http.get('*/api/config', () =>
      fail ? new HttpResponse(null, { status: 500 }) : HttpResponse.json(CONFIG),
    ),
  );
  const builds = countBuilds();
  const user = userEvent.setup();
  render(<LocalFrontDoor />);

  expect(await screen.findByText(UNCONFIRMED)).toBeDefined();
  await adjust(user);
  await user.clear(nature());
  await user.type(nature(), 'Still typing.');
  expect(nature().value).toBe('Still typing.');
  await user.selectOptions(screen.getByLabelText('4. Required equipment'), 'fan');
  expect(fileButton().disabled).toBe(true);
  expect(builds.count).toBe(0);

  fail = false;
  await user.click(screen.getByRole('button', { name: 'Ask the Department again' }));
  expect(await screen.findByText(BADGE)).toBeDefined();
  expect(document.activeElement).toBe(screen.getByText(BADGE));
  expect(nature().value).toBe('Still typing.');
  expect(fileButton().disabled).toBe(false);
});

test(`a /api/config that has not answered within ${CONFIG_TIMEOUT_MS} ms counts as unconfirmed`, async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  server.use(
    http.get('*/api/config', async () => {
      await delay('infinite');
      return HttpResponse.json(CONFIG);
    }),
  );
  render(<LocalFrontDoor />);
  await act(() => vi.advanceTimersByTimeAsync(CONFIG_TIMEOUT_MS - 100));
  expect(screen.queryByText(UNCONFIRMED)).toBeNull();
  await act(() => vi.advanceTimersByTimeAsync(200));
  expect(await screen.findByText(UNCONFIRMED)).toBeDefined();
  expect(screen.getByRole('button', { name: 'Ask the Department again' })).toBeDefined();
  expect(fileButton().disabled).toBe(true);
});

test('a build that ends is kept once in My department, with a DUE number and no link, however often it is replayed', async () => {
  // Reduced motion: one tick jumps to the final frame, so playback ends quickly.
  vi.stubGlobal('matchMedia', () => ({ matches: true }));
  server.use(
    http.get('*/api/config', () => HttpResponse.json(CONFIG)),
    http.post('*/api/build', ({ request }) => {
      const requestId = request.headers.get('x-request-id') ?? '';
      const events: StreamEvent[] = [
        { type: 'attempt', requestId, attempt: pressed(1) },
        { type: 'done', requestId, header: header([pressed(1)]) },
      ];
      return new HttpResponse(events.map((e) => `${JSON.stringify(e)}\n`).join(''));
    }),
  );
  const user = userEvent.setup();
  render(<LocalFrontDoor />);
  const department = () => screen.getByRole('region', { name: 'My department' });
  expect(within(department()).getByText('No builds filed in this browser yet.')).toBeDefined();

  await screen.findByText(BADGE);
  await user.click(fileButton());
  const verdict = "IT WORKED Gemma's machine pressed the button. The simulator verified it.";
  await vi.waitFor(() => expect(screen.getByRole('status').textContent).toBe(verdict));
  const card = await within(department()).findByRole('listitem');
  expect(within(card).getByText('DUE-0001')).toBeDefined();
  expect(within(card).getByText('The Scenic Route')).toBeDefined();
  expect(within(department()).queryAllByRole('link')).toEqual([]);

  await user.click(screen.getByRole('button', { name: 'Replay' }));
  await vi.waitFor(() => expect(screen.getByRole('status').textContent).toBe(verdict));
  expect(within(department()).getAllByRole('listitem')).toHaveLength(1);
});

test('a build this browser will not keep says so at its ending instead of vanishing from My department', async () => {
  vi.stubGlobal('matchMedia', () => ({ matches: true }));
  server.use(
    http.get('*/api/config', () => HttpResponse.json(CONFIG)),
    http.post('*/api/build', ({ request }) => {
      const requestId = request.headers.get('x-request-id') ?? '';
      const events: StreamEvent[] = [
        { type: 'attempt', requestId, attempt: pressed(1) },
        { type: 'done', requestId, header: header([pressed(1)]) },
      ];
      return new HttpResponse(events.map((e) => `${JSON.stringify(e)}\n`).join(''));
    }),
  );
  const user = userEvent.setup();
  render(<LocalFrontDoor />);
  await screen.findByText(BADGE);
  const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new DOMException('full', 'QuotaExceededError');
  });
  try {
    await user.click(fileButton());
    expect((await screen.findByRole('alert')).textContent).toMatch(/would not keep the build/);
    const department = screen.getByRole('region', { name: 'My department' });
    expect(within(department).getByText('No builds filed in this browser yet.')).toBeDefined();
  } finally {
    setItem.mockRestore();
  }
});
