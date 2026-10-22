import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';
import { VIEWPORTS, expectAxeClean, expectNoOverflow } from './layout';

const ID = '00000000-0000-4000-8000-000000000001';

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
