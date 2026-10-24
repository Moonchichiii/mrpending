import { cleanup, render, screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest';
import { App } from './App';

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

test('the static front door opens on the gallery with the two actions and no form', async () => {
  render(<App />);
  expect(screen.getByRole('heading', { level: 1, name: 'Mr. Pending' })).toBeDefined();
  expect(screen.getByText('This archive replays recorded builds. It takes no requests.')).toBeDefined();
  expect(screen.getByRole('link', { name: 'Watch Mr. Pending at work' }).getAttribute('href')).toBe(
    '#gallery',
  );
  expect(screen.getByRole('link', { name: 'Run it on your machine' }).getAttribute('href')).toMatch(
    /README|#readme/i,
  );
  // Mr. Pending stands at the closed counter from the first render, both rig variants drawn for the stylesheet to pick.
  const closed = screen.getByText('The Department is closed to new applications. The archive is open.');
  const variants = closed.parentElement?.parentElement?.querySelectorAll('svg[data-variant]');
  expect([...(variants ?? [])].map((svg) => svg.getAttribute('data-variant'))).toEqual(['desk', 'phone']);
  const gallery = screen.getByRole('region', { name: 'The gallery' });
  expect(gallery.id).toBe('gallery');
  expect(screen.queryByRole('form')).toBeNull();
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
  expect(agent.requests).toBe(0);
});
