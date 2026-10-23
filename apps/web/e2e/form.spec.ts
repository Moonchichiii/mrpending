import { readFileSync } from 'node:fs';
import { Attempt, BuildHeader, Form } from '@pending/contract';
import type { StreamEvent } from '@pending/contract';
import { report } from '@pending/machine';
import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';
import { VIEWPORTS, expectAxeClean, expectNoOverflow } from './layout';

const ID = '00000000-0000-4000-8000-000000000001';

// A recorded build in two trials: lost, then repaired by removing p4 and pressed (MACHINE-RULES section 7 fixtures).
const fixture = (name: string, file: string): unknown =>
  JSON.parse(
    readFileSync(new URL(`../../../packages/machine/fixtures/${name}/${file}.json`, import.meta.url), 'utf8'),
  );
const FORM = Form.parse(fixture('lost', 'form'));
const ATTEMPTS = [
  Attempt.parse({
    n: 1,
    blueprint: fixture('lost', 'blueprint'),
    violations: [],
    events: fixture('lost', 'events'),
    outcome: 'lost',
    failedAt: 'L3',
  }),
  Attempt.parse({
    n: 2,
    blueprint: fixture('repaired', 'blueprint'),
    violations: [],
    events: fixture('repaired', 'events'),
    outcome: 'pressed',
    patch: fixture('repaired', 'patch'),
  }),
];
const recorded = (requestId: string): StreamEvent[] => [
  ...ATTEMPTS.map((attempt): StreamEvent => ({ type: 'attempt', requestId, attempt })),
  {
    type: 'done',
    requestId,
    header: BuildHeader.parse({
      id: 'b1',
      contractVersion: 'c1',
      rulesVersion: 'r2',
      promptVersion: 'p1',
      form: FORM,
      model: { mode: 'local', id: 'gemma4:e2b', host: 'ollama' },
      title: 'The Scenic Route',
      report: report(ATTEMPTS),
      createdAt: '2026-10-22T10:00:00.000Z',
    }),
  },
];

// The local front door with the agent mocked at the network boundary.
async function open(page: Page) {
  await page.route('**/api/config', (route) =>
    route.fulfill({
      json: {
        inference: 'this-machine',
        model: { mode: 'local', id: 'gemma4:e2b', host: 'ollama' },
        voice: { elevenlabs: false },
        telemetry: false,
        repairs: 2,
        contractVersion: 'c1',
        rulesVersion: 'r2',
      },
    }),
  );
  await page.goto('/');
  await expect(page.getByText('Gemma runs on this machine. Your prompts stay here.')).toBeVisible();
}

test('Form 27B/6 is completed and filed with the keyboard alone', async ({ page }) => {
  await open(page);
  const filed = page.waitForRequest('**/api/build');
  await page.route('**/api/build', (route) =>
    route.fulfill({
      status: 503,
      json: { code: 'MODEL_UNAVAILABLE', message: 'No model.', requestId: ID, retryable: true },
    }),
  );
  await page.getByLabel('1. Nature of the request').focus();
  await page.keyboard.type('A scenic route, please.');
  await page.keyboard.press('Tab');
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('4');
  await page.keyboard.press('Tab');
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('9');
  await page.keyboard.press('Tab');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'File Form 27B/6' })).toBeFocused();
  await page.keyboard.press('Enter');
  expect((await filed).postDataJSON()).toEqual({
    nature: 'A scenic route, please.',
    minParts: 4,
    maxParts: 9,
    required: 'ramp',
  });
  await expect(page.getByRole('alert')).toHaveText(/Gemma is not answering/);
  await expectAxeClean(page, 'form after filing, model unavailable');
});

test('the form is axe clean empty, with field errors and with the rejection', async ({ page }) => {
  await open(page);
  await expectAxeClean(page, 'form empty');
  await page.getByLabel('2. Fewest parts').fill('');
  await page.getByLabel('4. Required equipment').selectOption('fan');
  await page.getByLabel('5. Forbidden equipment').selectOption('fan');
  await page.getByRole('button', { name: 'File Form 27B/6' }).click();
  await expect(page.getByRole('alert')).toContainText('Form 27B/6 rejected');
  await expect(page.getByText('Item 2 must be a whole number from 2 to 8.')).toBeVisible();
  await expectAxeClean(page, 'form with field errors and rejection');
});

test('without a confirmed config the form is editable, files nothing and is axe clean', async ({ page }) => {
  const builds: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/build') builds.push(request.url());
  });
  await page.route('**/api/config', (route) => route.fulfill({ status: 500 }));
  await page.goto('/');
  await expect(page.getByText(/The Department has not confirmed where drafting happens/)).toBeVisible();
  await page.getByLabel('1. Nature of the request').fill('A scenic route, please.');
  await page.getByLabel('1. Nature of the request').press('Tab');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'File Form 27B/6' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Ask the Department again' })).toBeVisible();
  await expectAxeClean(page, 'form with unconfirmed config');
  expect(builds).toEqual([]);
});

// The page clock drives playback, so each state is held on a known step while axe reads it.
test('the board is axe clean while a trial runs and beside the correction', async ({ page }) => {
  await page.clock.install();
  await open(page);
  await page.route('**/api/build', (route) => {
    const requestId = route.request().headers()['x-request-id'] ?? '';
    return route.fulfill({
      body: recorded(requestId)
        .map((e) => `${JSON.stringify(e)}\n`)
        .join(''),
    });
  });
  await page.getByLabel('1. Nature of the request').fill(FORM.nature);
  await page.getByRole('button', { name: 'File Form 27B/6' }).click();
  const status = page.getByRole('status');
  const pause = page.getByRole('button', { name: 'Pause' });

  await expect(status).toHaveText('Trial 1 in progress.');
  await page.clock.runFor(120 * 4);
  await pause.click();
  await expect(pause).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-ball]')).toHaveCount(1);
  await expect(page.locator('[data-change]')).toHaveCount(0);
  await expectAxeClean(page, 'board running, trial 1');

  await pause.click();
  await page.clock.runFor(120 * (ATTEMPTS[0]?.events.at(-1)?.step ?? 0));
  await expect(status).toHaveText('Trial 2 in progress.');
  await pause.click();
  await expect(page.locator('[data-change="removed"]')).toHaveCount(1);
  await expectAxeClean(page, 'board running, trial 2 with the correction diff');
});

for (const viewport of VIEWPORTS) {
  test(`the form with its longest text and every message fits at ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await open(page);
    await page.getByLabel('1. Nature of the request').fill('W'.repeat(180));
    await page.getByLabel('3. Most parts').fill('');
    await page.getByLabel('4. Required equipment').selectOption('conveyor');
    await page.getByLabel('5. Forbidden equipment').selectOption('conveyor');
    await page.getByRole('button', { name: 'File Form 27B/6' }).click();
    await expect(page.getByRole('alert')).toBeVisible();
    await expectNoOverflow(page);
  });
}
