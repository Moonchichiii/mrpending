import { readFileSync } from 'node:fs';
import { Attempt, BuildHeader, Form, Line } from '@pending/contract';
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

test('a pressed build ends on the Engineering Report, saved as a 1200 x 630 PNG, and the card is axe clean', async ({
  page,
}, testInfo) => {
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

  // Both trials at 120 ms a step, then the press clock's hard cut at 1.60 s.
  const card = page.getByRole('region', { name: 'Engineering Report' });
  await expect(card).toBeVisible({ timeout: 20_000 });
  const landscape = card.locator('svg[data-shape="landscape"]');
  await expect(landscape.locator('[data-stamp]')).toHaveAttribute('data-stamp', 'APPROVED');
  await expect(landscape.locator('[data-number="attempts"]')).toHaveText('2');

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    card.getByRole('button', { name: 'Save as image' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('mr-pending-b1.png');
  // The issue's evidence, kept as a report attachment in the ignored test output, never compared or committed.
  const path = testInfo.outputPath('engineering-report.png');
  await download.saveAs(path);
  await testInfo.attach('engineering-report', { path, contentType: 'image/png' });
  const png = readFileSync(path);
  // The PNG signature, then the IHDR width and height: the landscape card at its own size.
  expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1200, 630]);

  await expectAxeClean(page, 'engineering report card', 'section[aria-label="Engineering Report"]');
});

// One line per mood in trial 1, so the playhead walks Mr. Pending through all three.
const MOODS = [
  { mood: 'slow', step: 0, text: 'The Department will now observe the apparatus.' },
  { mood: 'excited', step: 2, text: 'It moved! Please inform the entire Department.' },
  { mood: 'deadpan', step: 4, text: 'It has stopped moving.' },
] as const;
const said = (requestId: string): StreamEvent[] =>
  MOODS.map(({ mood, step, text }) => ({
    type: 'line',
    requestId,
    line: Line.parse({ id: mood, beat: 'running', mood, text, source: 'table', at: { attempt: 1, step } }),
  }));

test('Mr. Pending takes the mood of each line, beside the voice, and the desk is axe clean', async ({
  page,
}, testInfo) => {
  await page.clock.install();
  await open(page);
  await page.route('**/api/build', (route) => {
    const requestId = route.request().headers()['x-request-id'] ?? '';
    return route.fulfill({
      body: [...said(requestId), ...recorded(requestId)].map((e) => `${JSON.stringify(e)}\n`).join(''),
    });
  });
  await page.getByLabel('1. Nature of the request').fill(FORM.nature);
  // Time stands still from here, so only runFor moves the playhead and each mood holds for its picture.
  await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 1000);
  await page.getByRole('button', { name: 'File Form 27B/6' }).click();
  await expect(page.getByRole('status')).toHaveText('Trial 1 in progress.');
  const lines = page.getByRole('list', { name: 'Mr. Pending' });
  // The card holds the portrait and the lines; the desk figure is the rig itself.
  const card = lines.locator('xpath=../..');
  const rig = card.locator('svg[data-variant="desk"]');

  let at = 0;
  for (const { mood, step, text } of MOODS) {
    await page.clock.runFor(120 * (step - at));
    at = step;
    await expect(lines.locator('li').last()).toHaveText(text);
    await expect(lines.locator('li').last()).toHaveAttribute('data-mood', mood);
    await expect(rig).toHaveClass(new RegExp(mood));
    // The issue's evidence, kept as a report attachment in the ignored test output, never compared or committed.
    const path = testInfo.outputPath(`rig-${mood}.png`);
    await card.screenshot({ path, animations: 'disabled' });
    await testInfo.attach(`rig-${mood}`, { path, contentType: 'image/png' });
  }

  // Playback holds on the deadpan line while axe, which needs running timers, reads the desk.
  await page.getByRole('button', { name: 'Pause' }).click();
  await page.clock.resume();
  const voice = page.getByRole('region', { name: 'Voice' });
  await expect(voice.getByRole('button', { name: 'Skip voice' })).toBeVisible();
  await expect(
    page.getByRole('group', { name: 'Playback' }).getByRole('button', { name: 'Skip voice' }),
  ).toHaveCount(0);
  await expectAxeClean(page, 'desk with the rig and the voice');
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
