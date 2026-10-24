import { readFileSync } from 'node:fs';
import { Line } from '@pending/contract';
import type { StreamEvent } from '@pending/contract';
import { expect, test } from '@playwright/test';
import { ATTEMPTS, DEFAULT, adjust, ndjson, open, recorded } from './build';
import { PHONE, VIEWPORTS, expectAxeClean, expectNoOverflow, expectTargets } from './layout';

const ID = '00000000-0000-4000-8000-000000000001';

test('Form 27B/6 is unfolded, completed and filed with the keyboard alone', async ({ page }) => {
  await open(page);
  const filed = page.waitForRequest('**/api/build');
  await page.route('**/api/build', (route) =>
    route.fulfill({
      status: 503,
      json: { code: 'MODEL_UNAVAILABLE', message: 'No model.', requestId: ID, retryable: true },
    }),
  );
  const file = page.getByRole('button', { name: 'Ask Mr. Pending to press it' });
  await file.focus();
  await page.keyboard.press('Tab');
  await expect(page.getByText('Adjust the form')).toBeFocused();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('1. Nature of the request')).toBeFocused();
  await page.keyboard.press('ControlOrMeta+a');
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
  await expect(page.getByLabel('5. Forbidden equipment')).toBeFocused();
  // Back past the five items and the fold to the button above them.
  for (let i = 0; i < 6; i += 1) await page.keyboard.press('Shift+Tab');
  await expect(file).toBeFocused();
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

test('the first screen is Mr. Pending and the blue button, which files the folded, pre-filled form, and his rig carries on into the build', async ({
  page,
}, testInfo) => {
  for (const { width, height, beside } of [
    { width: 1440, height: 900, beside: true },
    { width: PHONE, height: 844, beside: false },
  ]) {
    await page.setViewportSize({ width, height });
    await open(page);
    // The full rig on every width, whole on the first screen: two fifths of a desktop's width, a third of a phone's
    // height.
    const rig = page.locator('svg[data-variant="desk"]');
    await expect(rig).toBeVisible();
    await expect(page.locator('svg[data-variant="phone"]')).toBeHidden();
    await expect(rig).toHaveClass(/slow/);
    const rigBox = await rig.boundingBox();
    if (rigBox === null) throw new Error('the rig is not laid out');
    if (beside) {
      expect(rigBox.width).toBeGreaterThanOrEqual(width * 0.4);
      expect(rigBox.y + rigBox.height).toBeLessThanOrEqual(height);
    } else expect(rigBox.height).toBeGreaterThanOrEqual(height / 3);
    // The status line is on his card; the status region keeps the same words for assistive technology.
    await expect(page.locator('p', { hasText: 'Form 27B/6 awaits filing.' })).toBeVisible();
    await expect(page.getByRole('status')).toHaveText('Form 27B/6 awaits filing.');
    // The board's own blue button at hero size, its label beside it: next to his card on a desktop, directly under
    // it on a phone, and in view without scrolling either way.
    const file = page.getByRole('button', { name: 'Ask Mr. Pending to press it' });
    await expect(file).toBeVisible();
    const dome = file.locator('svg[data-blue-button] [data-button]');
    await expect(dome).toHaveAttribute('data-pressed', 'false');
    expect((await dome.boundingBox())?.width).toBeGreaterThanOrEqual(80);
    const card = rig.locator('xpath=../..');
    const [cardBox, fileBox] = [await card.boundingBox(), await file.boundingBox()];
    if (cardBox === null || fileBox === null) throw new Error('the card or the button is not laid out');
    if (beside) {
      expect(fileBox.x).toBeGreaterThanOrEqual(cardBox.x + cardBox.width);
      expect(fileBox.y).toBeLessThan(cardBox.y + cardBox.height);
      expect(fileBox.y + fileBox.height).toBeGreaterThan(cardBox.y);
    } else {
      expect(fileBox.y - (cardBox.y + cardBox.height)).toBeGreaterThanOrEqual(0);
      expect(fileBox.y - (cardBox.y + cardBox.height)).toBeLessThanOrEqual(64);
    }
    expect(fileBox.height).toBeGreaterThanOrEqual(78);
    // Pressed and held, the dome sinks as it does on the board.
    const rest = await dome.locator('path').last().boundingBox();
    await file.hover();
    await page.mouse.down();
    const held = await dome.locator('path').last().boundingBox();
    expect((held?.y ?? 0) - (rest?.y ?? 0)).toBeGreaterThan(0);
    await page.mouse.move(0, 0);
    await page.mouse.up();
    await expect(page.getByText(/^File it as it stands or adjust it first/)).toBeVisible();
    await expect(page.getByText('Adjust the form')).toBeVisible();
    await expect(page.getByLabel('1. Nature of the request')).toBeHidden();
    await expectAxeClean(page, `first screen at ${width}`);
    // The issue's evidence, kept as a report attachment in the ignored test output, never compared or committed.
    const path = testInfo.outputPath(`first-screen-${width}.png`);
    await page.screenshot({ path, animations: 'disabled' });
    await testInfo.attach(`first-screen-${width}`, { path, contentType: 'image/png' });
  }

  // The rig on the front door is marked, and the drafting build shows that same element, not a second rig.
  // One click files the default request as it stands.
  const filed = page.waitForRequest('**/api/build');
  await page.route('**/api/build', () => {});
  await page.locator('svg[data-variant="desk"]').evaluate((el) => el.setAttribute('data-front-door', ''));
  await page.getByRole('button', { name: 'Ask Mr. Pending to press it' }).click();
  expect((await filed).postDataJSON()).toEqual(DEFAULT);
  await expect(page.getByRole('status')).toHaveText('Drafting. Please do not rush the Department.');
  await expect(page.locator('svg[data-variant="desk"]')).toHaveCount(1);
  await expect(page.locator('svg[data-variant="desk"][data-front-door]')).toHaveCount(1);
  await expect(page.getByText(/^File it as it stands/)).toHaveCount(0);
});

test('the form is axe clean folded, unfolded, with field errors and with the rejection', async ({ page }) => {
  await open(page);
  await expectAxeClean(page, 'form folded');
  await adjust(page);
  await expectAxeClean(page, 'form unfolded');
  await page.getByLabel('2. Fewest parts').fill('');
  await page.getByLabel('4. Required equipment').selectOption('fan');
  await page.getByLabel('5. Forbidden equipment').selectOption('fan');
  await page.getByRole('button', { name: 'Ask Mr. Pending to press it' }).click();
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
  await adjust(page);
  await page.getByLabel('1. Nature of the request').fill('A scenic route, please.');
  await page.getByLabel('1. Nature of the request').press('Tab');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Ask Mr. Pending to press it' })).toBeDisabled();
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
    return route.fulfill({ body: ndjson(recorded(requestId)) });
  });
  await page.getByRole('button', { name: 'Ask Mr. Pending to press it' }).click();
  const status = page.getByRole('status');
  const pause = page.getByRole('button', { name: 'Pause' });

  await expect(status).toHaveText('Trial 1 in progress.');
  await page.clock.runFor(120 * 4);
  await pause.click();
  await expect(pause).toHaveAttribute('aria-pressed', 'true');
  // The gallery's thumbnails draw balls of their own, so the board is looked for in the desk.
  await expect(page.getByRole('region', { name: 'Form 27B/6' }).locator('[data-ball]')).toHaveCount(1);
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
    return route.fulfill({ body: ndjson(recorded(requestId)) });
  });
  await page.getByRole('button', { name: 'Ask Mr. Pending to press it' }).click();

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
    return route.fulfill({ body: ndjson([...said(requestId), ...recorded(requestId)]) });
  });
  // Time stands still from here, so only runFor moves the playhead and each mood holds for its picture.
  await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 1000);
  await page.getByRole('button', { name: 'Ask Mr. Pending to press it' }).click();
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
  test(`the one-button front door fits at ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await open(page);
    await expect(page.getByRole('button', { name: 'Ask Mr. Pending to press it' })).toBeVisible();
    await expectNoOverflow(page);
    if (viewport.width <= PHONE) await expectTargets(page);
  });

  test(`the form with its longest text and every message fits at ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await open(page);
    await adjust(page);
    await page.getByLabel('1. Nature of the request').fill('W'.repeat(180));
    await page.getByLabel('3. Most parts').fill('');
    await page.getByLabel('4. Required equipment').selectOption('conveyor');
    await page.getByLabel('5. Forbidden equipment').selectOption('conveyor');
    await page.getByRole('button', { name: 'Ask Mr. Pending to press it' }).click();
    await expect(page.getByRole('alert')).toBeVisible();
    await expectNoOverflow(page);
    if (viewport.width <= PHONE) await expectTargets(page);
  });
}
