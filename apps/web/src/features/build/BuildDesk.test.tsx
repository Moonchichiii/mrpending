import type { StreamEvent } from '@pending/contract';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, expect, test, vi } from 'vitest';
import { BuildDesk } from './BuildDesk';
import { header, pressed } from './model/testBuild';

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
