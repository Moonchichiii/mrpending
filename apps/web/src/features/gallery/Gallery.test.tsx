import { Build } from '@pending/contract';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest';
import { Gallery } from './Gallery';
import { MyDepartment } from './MyDepartment';

const files = import.meta.glob<unknown>('../../../public/gallery/*.json', { eager: true, import: 'default' });
const raw = (slug: string) => files[`../../../public/gallery/${slug}.json`];

// The static host serves the gallery files; the agent is down, and any request to it is counted.
const agent = { requests: 0 };
const server = setupServer(
  http.get('*/gallery/:file', ({ params }) => {
    const value = raw(String(params.file).replace(/\.json$/, ''));
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
  localStorage.clear();
  // Reduced motion: each playback tick jumps to the end of the next trial, so a record plays through quickly.
  vi.stubGlobal('matchMedia', () => ({ matches: true }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.pushState({}, '', '/');
});
afterAll(() => server.close());

test('the gallery opens every recorded build with the agent unreachable, and never asks it anything', async () => {
  render(<Gallery />);
  const cards = await screen.findAllByRole('listitem');
  expect(cards).toHaveLength(5);
  const link = screen.getAllByRole('link')[0];
  expect(link?.getAttribute('href')).toMatch(/^\/r\/[a-z]+$/);
  expect(screen.queryByText(/live/i)).toBeNull();
  expect(agent.requests).toBe(0);
});

test('/r/<slug> opens one record with its provenance line and the link to how the gallery was produced', async () => {
  window.history.pushState({}, '', '/r/budget');
  render(<Gallery />);
  const record = await screen.findByRole('article', { name: 'Button Press Mechanism Design' });
  expect(
    within(record).getByText(
      /^Recorded local inference · gemma4:e4b · digest dc35e8d9c606 · Ollama 0\.40\.7 · prompt v2 · rules r2 · recorded 2026-10-22 ·/,
    ),
  ).toBeDefined();
  expect(
    within(record).getByRole('link', { name: 'How the gallery was produced' }).getAttribute('href'),
  ).toMatch(/README|#how-the-gallery-was-produced/);
  expect(screen.queryByText(/live/i)).toBeNull();
  expect(agent.requests).toBe(0);
});

const TESTING = 'TESTING THE MACHINE The simulator is checking whether the ball reaches the blue button.';
const WORKED = "IT WORKED Gemma's machine pressed the button. The simulator verified it.";

test('a record page plays the recording back with the playback controls, its lines and the recomputed verdict', async () => {
  const budget = Build.parse(raw('budget'));
  window.history.pushState({}, '', '/r/budget');
  const user = userEvent.setup();
  render(<Gallery />);
  const record = await screen.findByRole('article', { name: budget.title });
  expect(within(record).getByRole('group', { name: 'Playback' })).toBeDefined();
  expect(within(record).getByRole('status').textContent).toBe(TESTING);

  await vi.waitFor(() => expect(within(record).getByRole('status').textContent).toBe(WORKED));
  expect(within(record).getByRole('region', { name: 'Simulation result' }).textContent).toContain(
    budget.report.verdict,
  );
  const last = budget.attempts.at(-1);
  expect(
    within(record)
      .getByRole('button', { name: new RegExp(`^Trial ${last?.n},`) })
      .getAttribute('aria-pressed'),
  ).toBe('true');
  expect(
    within(within(record).getByRole('list', { name: 'Mr. Pending' }))
      .getAllByRole('listitem')
      .map((li) => li.textContent),
  ).toEqual(budget.lines.map((l) => (l.source === 'model' ? `Memo: ${l.text}` : l.text)));

  await user.click(within(record).getByRole('button', { name: 'Replay' }));
  expect(within(record).getByRole('status').textContent).toBe(TESTING);
  expect(document.activeElement).toBe(within(record).getByRole('status'));
  expect(agent.requests).toBe(0);
});

test('an unknown slug is not fetched as a record; the gallery itself is shown', async () => {
  window.history.pushState({}, '', '/r/elsewhere');
  render(<Gallery />);
  expect(await screen.findAllByRole('listitem')).toHaveLength(5);
});

test('My department imports a forged record as the rules tell it, with a DUE number and no link', async () => {
  const forged = structuredClone(raw('scenic'));
  if (typeof forged !== 'object' || forged === null || !('report' in forged))
    throw new Error('scenic is no build');
  forged.report = { attempts: 1, parts: 1, pressed: false, verdict: 'Forged.' };
  render(<MyDepartment />);
  await userEvent.upload(
    screen.getByLabelText('Import a build (JSON, up to 512 KB)'),
    new File([JSON.stringify(forged)], 'scenic.json', { type: 'application/json' }),
  );
  const card = await screen.findByRole('listitem');
  expect(within(card).getByText('DUE-0001')).toBeDefined();
  expect(within(card).queryByText('Forged.')).toBeNull();
  expect(within(card).getByRole('button', { name: 'Export DUE-0001 as JSON' })).toBeDefined();
  expect(screen.queryAllByRole('link')).toEqual([]);
});

test('My department refuses a record under other rules with a plain message', async () => {
  const other = structuredClone(raw('scenic'));
  if (typeof other !== 'object' || other === null) throw new Error('scenic is no build');
  render(<MyDepartment />);
  await userEvent.upload(
    screen.getByLabelText('Import a build (JSON, up to 512 KB)'),
    new File([JSON.stringify({ ...other, rulesVersion: 'r1' })], 'old.json', { type: 'application/json' }),
  );
  expect((await screen.findByRole('alert')).textContent).toMatch(/filed under rules r1/);
  expect(screen.queryByRole('listitem')).toBeNull();
});
