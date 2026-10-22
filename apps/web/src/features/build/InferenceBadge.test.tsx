import { cleanup, render, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, expect, test } from 'vitest';
import { InferenceBadge, useInference } from './InferenceBadge';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterEach(() => {
  server.resetHandlers();
  cleanup();
});
afterAll(() => server.close());

// The model field deliberately says hosted/openrouter: the copy must follow inference alone.
const config = (inference: string) => ({
  inference,
  model: { mode: 'hosted', id: 'gemma4:e2b', host: 'openrouter' },
  voice: { elevenlabs: false },
  telemetry: false,
  repairs: 2,
  contractVersion: 'c1',
  rulesVersion: 'r2',
});

function Badge() {
  const { inference, retry } = useInference();
  return <InferenceBadge inference={inference} onRetry={retry} />;
}

test.each([
  ['this-machine', 'Gemma runs on this machine. Your prompts stay here.'],
  [
    'server',
    'Gemma runs on the Mr. Pending server. Your prompts go to that server, not to a model provider.',
  ],
  ['hosted', 'Gemma runs hosted via OpenRouter. Your request is sent to OpenRouter.'],
])('inference %s gives its copy', async (inference, copy) => {
  server.use(http.get('*/api/config', () => HttpResponse.json(config(inference))));
  render(<Badge />);
  expect(await screen.findByText(copy)).toBeDefined();
});

test('a config that fails the schema claims no inference and offers to ask again', async () => {
  server.use(http.get('*/api/config', () => HttpResponse.json(config('everywhere'))));
  const { container } = render(<Badge />);
  expect(await screen.findByRole('button', { name: 'Ask the Department again' })).toBeDefined();
  expect(container.textContent).not.toMatch(/Gemma/);
});
