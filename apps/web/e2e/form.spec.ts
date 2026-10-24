import { readFileSync } from 'node:fs';
import { Line } from '@pending/contract';
import type { StreamEvent } from '@pending/contract';
import { expect, test } from '@playwright/test';
import { ATTEMPTS, DEFAULT, FILE, adjust, ndjson, open, recorded } from './build';
import { PHONE, VIEWPORTS, expectAxeClean, expectNoOverflow, expectTargets } from './layout';

const ID = '00000000-0000-4000-8000-000000000001';
const INTRODUCTION =
  'Chief Engineer of the Department of Unnecessary Engineering. One job: press one blue button.';

test('Form 27B/6 is unfolded under the board, completed and filed with the keyboard alone', async ({
  page,
}) => {
  await open(page);
  const filed = page.waitForRequest('**/api/build');
  await page.route('**/api/build', (route) =>
    route.fulfill({
      status: 503,
      json: { code: 'MODEL_UNAVAILABLE', message: 'No model.', requestId: ID, retryable: true },
    }),
  );
  const file = page.getByRole('button', { name: FILE });
  await file.focus();
  // Past the board's controls, waiting, and the folded Minutes, the first closed section under the board.
  await page.keyboard.press('Tab');
  await expect(page.locator('summary', { hasText: /^Minutes$/ })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByText('Advanced settings')).toBeFocused();
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
  // Back past the five items, the fold and the board's minutes to the button beside Mr. Pending.
  for (let i = 0; i < 7; i += 1) await page.keyboard.press('Shift+Tab');
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

// The maintainer's layout: one stage. Mr. Pending, his bubble and the button on the yellow band, the idle board under
// it with the model it will use, everything else folded away; at 1440 the board fits, at 390 the button does.
const SCREENS = [
  { width: 1440, height: 900, shown: 'desk' },
  { width: PHONE, height: 844, shown: 'phone' },
] as const;
const CONTROLS = ['Pause', 'Replay', '0.5×', '1×', 'Impatient', 'Withdraw'];

test('the front door is one screen: Mr. Pending, the blue button and the idle board, the rest folded away', async ({
  page,
}, testInfo) => {
  for (const { width, height, shown } of SCREENS) {
    await page.setViewportSize({ width, height });
    await open(page);
    await expect(page.getByRole('heading', { level: 1, name: 'Mr. Pending' })).toBeVisible();
    await expect(page.getByText('The Department of Unnecessary Engineering', { exact: true })).toBeVisible();
    const rig = page.locator(`svg[data-variant="${shown}"]`);
    await expect(rig).toBeVisible();
    await expect(rig).toHaveClass(/slow/);
    // Mr. Pending beside his one bubble, which says his introduction, with Voice on and Skip voice under it.
    const card = rig.locator('xpath=../..');
    const voice = page.getByRole('region', { name: 'Voice' });
    await expect(card.getByRole('region', { name: 'Voice' })).toHaveCount(1);
    await expect(voice.locator('[aria-live="polite"]')).toHaveText(INTRODUCTION);
    await expect(page.getByRole('status')).toHaveText('Form 27B/6 awaits filing.');
    await expect(voice.getByRole('button', { name: 'Voice on' })).toHaveAttribute('aria-pressed', 'true');
    await expect(voice.getByRole('button', { name: 'Skip voice' })).toBeVisible();

    // The one call to action is the lettered blue button, inside the first screen at both widths; the playback
    // controls already stand on the board, waiting.
    const file = page.getByRole('button', { name: FILE });
    await expect(file).toBeVisible();
    await expect(page.getByRole('button')).toHaveText(['Voice on', 'Skip voice', FILE, ...CONTROLS]);
    for (const control of CONTROLS) await expect(page.getByRole('button', { name: control })).toBeDisabled();
    const fileBox = await file.boundingBox();
    expect(fileBox && fileBox.y + fileBox.height).toBeLessThanOrEqual(height);
    expect(fileBox?.height).toBeGreaterThanOrEqual(78);

    // The idle board from the first paint: its badge from /api/config, nothing attempted, the empty sheet with its
    // caption, the six steps to do and the result pending.
    const board = page.getByRole('region', { name: 'The board' });
    await expect(board.getByText('Gemma 4 E2B · Ollama · Running locally', { exact: true })).toBeVisible();
    await expect(board.getByText('Attempt 0 / 6', { exact: true })).toBeVisible();
    await expect(board.getByRole('img', { name: 'The empty board' })).toBeVisible();
    await expect(board.locator('[data-hopper]')).toHaveCount(1);
    await expect(board.locator('[data-button]')).toHaveCount(1);
    await expect(board.getByText('The ridiculous machinery appears here.', { exact: true })).toBeVisible();
    await expect(board.getByRole('list', { name: 'Steps' }).getByRole('listitem')).toHaveCount(6);
    const result = board.getByRole('region', { name: 'Simulation result' });
    await expect(result.locator('[data-stamp]')).toHaveText('PENDING');
    // The issue's evidence: the first screen as a visitor sees it, kept as a report attachment, never compared.
    const path = testInfo.outputPath(`first-screen-${width}.png`);
    await page.screenshot({ path, animations: 'disabled' });
    await testInfo.attach(`first-screen-${width}`, { path, contentType: 'image/png' });
    if (width === 1440) {
      // The band, then the board down to its pinned result, without scrolling.
      const cardBox = await card.boundingBox();
      const boardBox = await board.boundingBox();
      const resultBox = await result.boundingBox();
      expect(fileBox && cardBox && fileBox.x - (cardBox.x + cardBox.width)).toBeGreaterThan(0);
      expect(boardBox && cardBox && boardBox.y - (cardBox.y + cardBox.height)).toBeGreaterThan(0);
      expect(resultBox && resultBox.y + resultBox.height).toBeLessThanOrEqual(height);
    }

    // Everything else is folded: the five items, the department and the gallery; no guide.
    await expect(page.getByText('Advanced settings', { exact: true })).toBeAttached();
    await expect(page.getByLabel('1. Nature of the request')).toBeHidden();
    await expect(page.getByRole('region', { name: 'My department' })).toBeHidden();
    await expect(page.getByRole('region', { name: 'The gallery' })).toBeHidden();
    await expect(page.getByText(/^File it as it stands/)).toHaveCount(0);
    await expect(page.getByRole('list', { name: 'How to file' })).toHaveCount(0);
    await expectNoOverflow(page);
    await expectAxeClean(page, `one-screen front door at ${width}`);
  }

  // One click files the default request as it stands; the build streams into the same board with the same rig, on the
  // same page.
  const filed = page.waitForRequest('**/api/build');
  await page.route('**/api/build', () => {});
  await page.locator('svg[data-variant="desk"]').evaluate((el) => el.setAttribute('data-front-door', ''));
  const address = page.url();
  await page.getByRole('button', { name: FILE }).click();
  expect((await filed).postDataJSON()).toEqual(DEFAULT);
  await expect(page.getByRole('status')).toHaveText('Drafting. Please do not rush the Department.');
  await expect(page.locator('svg[data-variant="desk"]')).toHaveCount(1);
  await expect(page.locator('svg[data-variant="desk"][data-front-door]')).toHaveCount(1);
  await expect(
    page.getByRole('region', { name: 'The board' }).getByRole('img', { name: 'The empty board' }),
  ).toBeVisible();
  expect(page.url()).toBe(address);
});

test('the form is axe clean folded, unfolded, with field errors and with the rejection', async ({ page }) => {
  await open(page);
  await expectAxeClean(page, 'form folded');
  await adjust(page);
  await expectAxeClean(page, 'form unfolded');
  await page.getByLabel('2. Fewest parts').fill('');
  await page.getByLabel('4. Required equipment').selectOption('fan');
  await page.getByLabel('5. Forbidden equipment').selectOption('fan');
  await page.getByRole('button', { name: FILE }).click();
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
  await expect(page.getByRole('button', { name: FILE })).toBeDisabled();
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
  await page.getByRole('button', { name: FILE }).click();
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

test('a pressed build ends on its verdict, the report in the Minutes saved as a 1200 x 630 PNG, axe clean', async ({
  page,
}, testInfo) => {
  await open(page);
  await page.route('**/api/build', (route) => {
    const requestId = route.request().headers()['x-request-id'] ?? '';
    return route.fulfill({ body: ndjson(recorded(requestId)) });
  });
  await page.getByRole('button', { name: FILE }).click();

  // Both trials at 120 ms a step, then the press clock's hard cut at 1.60 s, where the result turns PRESSED.
  const result = page
    .getByRole('region', { name: 'The board' })
    .getByRole('region', { name: 'Simulation result' });
  await expect(result.locator('[data-stamp]')).toHaveText('PRESSED', { timeout: 20_000 });
  await expect(result).toContainText('One button. An extraordinary amount of paperwork.');

  // The Engineering Report and Save as image wait in the Minutes, folded under the board.
  await page.getByText('Minutes', { exact: true }).click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Save as image' }).click(),
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

  // The Engineering Report in the Minutes, the simulator's numbers on the card.
  const card = page.getByRole('region', { name: 'Engineering Report' });
  const landscape = card.locator('svg[data-shape="landscape"]');
  await expect(landscape.locator('[data-stamp]')).toHaveAttribute('data-stamp', 'APPROVED');
  await expect(landscape.locator('[data-number="attempts"]')).toHaveText('2');
  await expectAxeClean(page, 'engineering report card', 'details[open]');
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

test('Mr. Pending takes the mood of each line, beside his bubble, and the stage is axe clean', async ({
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
  await page.getByRole('button', { name: FILE }).click();
  await expect(page.getByRole('status')).toHaveText('Trial 1 in progress.');
  // The lines said are kept in the board's closed fold; the rig and his bubble stand side by side above it.
  const lines = page.getByRole('list', { name: 'Mr. Pending', includeHidden: true });
  const rig = page.locator('svg[data-variant="desk"]');
  const card = rig.locator('xpath=../..');

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
  await expectAxeClean(page, 'stage with the rig and the bubble');
});

for (const viewport of VIEWPORTS) {
  test(`the one-screen front door fits at ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await open(page);
    await expect(page.getByRole('button', { name: FILE })).toBeVisible();
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
    await page.getByRole('button', { name: FILE }).click();
    await expect(page.getByRole('alert')).toBeVisible();
    await expectNoOverflow(page);
    if (viewport.width <= PHONE) await expectTargets(page);
  });
}
