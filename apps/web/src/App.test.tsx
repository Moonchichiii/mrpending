import { cleanup, render, screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { App } from './App';
import { CLOSED } from './StaticFrontDoor';

const files = import.meta.glob<unknown>('../public/gallery/*.json', { eager: true, import: 'default' });

// The static host serves the committed gallery; the agent is down, and any request to it is counted.
const agent = { requests: 0 };
const server = setupServer(
  http.get('*/gallery/:file', ({ params }) => {
    const value = files[`../public/gallery/${String(params.file)}`];
    return value === undefined ? new HttpResponse(null, { status: 404 }) : HttpResponse.json(value);
  }),
  http.all('*/api/*', () => {
    agent.requests += 1;
    return HttpResponse.error();
  }),
);
beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
beforeEach(() => {
  agent.requests = 0;
  // Reduced motion: a record page's playback jumps trial by trial; the front door's rig subscribes to the same query.
  vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.pushState({}, '', '/');
});
afterAll(() => server.close());

test('the static front door is the local one screen with a recording behind its button, the gallery folded', async () => {
  const user = userEvent.setup();
  render(<App />);
  expect(screen.getByRole('heading', { level: 1, name: 'Mr. Pending' })).toBeDefined();
  expect(screen.getByRole('link', { name: 'Run it on your machine' }).getAttribute('href')).toMatch(
    /README|#readme/i,
  );
  // Mr. Pending stands at the closed counter from the first render, saying so in his bubble, both rig variants drawn
  // for the stylesheet to pick.
  const voice = screen.getByRole('region', { name: 'Voice' });
  expect(within(voice).getByText(CLOSED)).toBeDefined();
  const variants = voice.parentElement?.parentElement?.querySelectorAll('svg[data-variant]');
  expect([...(variants ?? [])].map((svg) => svg.getAttribute('data-variant'))).toEqual(['desk', 'phone']);
  const sheet = screen.getByRole('img', { name: 'The empty board' });
  expect(screen.queryByRole('form')).toBeNull();
  // The button waits for the recording, which this browser replays through the simulator before it is offered.
  const play = screen.getByRole<HTMLButtonElement>('button', { name: 'Press the button' });
  expect(play.disabled).toBe(true);
  const board = screen.getByRole('region', { name: 'The board' });
  expect(await within(board).findByText('Gemma 4 E4B · Ollama · Recorded')).toBeDefined();
  expect(play.disabled).toBe(false);
  await user.click(play);
  // Reduced motion: the recording jumps to its ending on the same board, its result stamped PRESSED.
  const result = within(board).getByRole('region', { name: 'Simulation result' });
  await vi.waitFor(() => expect(result.querySelector('[data-stamp]')?.textContent).toBe('PRESSED'));
  expect(screen.getByRole('region', { name: 'The board' })).toBe(board);
  expect(within(board).getAllByRole('img')[0]).toBe(sheet);
  expect(screen.getByRole('heading', { level: 1, name: 'Mr. Pending' })).toBeDefined();

  const gallery = screen.getByRole('region', { name: 'The gallery' });
  expect(gallery.id).toBe('gallery');
  expect(gallery.closest('details')?.open).toBe(false);
  // Every committed record is replayed and shelved, with the agent unreachable and never asked.
  expect(await within(gallery).findAllByRole('listitem')).toHaveLength(Object.keys(files).length);
  expect(
    within(gallery)
      .getAllByRole('link')
      .map((a) => a.getAttribute('href')),
  ).toEqual(expect.arrayContaining(['/r/budget', '/r/scenic']));
  expect(screen.queryByText(/live/i)).toBeNull();
  expect(agent.requests).toBe(0);
});

test('/r/<slug> opens that record page inside the static front door', async () => {
  window.history.pushState({}, '', '/r/scenic');
  render(<App />);
  const gallery = screen.getByRole('region', { name: 'The gallery' });
  const record = await within(gallery).findByRole('article');
  expect(within(record).getByText(/^Recorded local inference · /)).toBeDefined();
  expect(within(record).getByRole('link', { name: 'Back to the gallery' }).getAttribute('href')).toBe('/');
  // One playback at a time: the record plays, so the button on the screen above waits and says why.
  const play = screen.getByRole<HTMLButtonElement>('button', { name: 'Press the button' });
  expect(play.disabled).toBe(true);
  expect(play.getAttribute('aria-describedby')).toBe(
    screen.getByText('A recorded build is already playing in the gallery below.').id,
  );
  expect(agent.requests).toBe(0);
});
