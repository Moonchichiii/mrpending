import { Build } from '@pending/contract';
import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';
import { FILE } from './build';
import {
  PHONE,
  VIEWPORTS,
  expectAxeClean,
  expectFocusVisible,
  expectNoOverflow,
  expectTargets,
} from './layout';

const CLOSED =
  'The Department is closed to new applications. The button plays a recorded build, which this browser checks again with the simulator before it is shown.';
// The stylesheet's phone width (40rem at the default 16 px) shows the head alone; wider viewports show the full rig.
const PHONE_RIG = 640;

test('the static front door makes no API call', async ({ page }) => {
  const api: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/api')) api.push(request.url());
  });
  await page.goto('/');
  await expect(page.getByRole('button', { name: FILE })).toBeEnabled();
  // Mr. Pending is at the closed counter from the first paint, in the slow mood.
  await expect(page.getByText(CLOSED)).toBeVisible();
  await expect(page.locator('svg[data-variant="desk"]')).toHaveClass(/slow/);
  expect(api).toEqual([]);
  await expectAxeClean(page, 'static front door');
  await expectFocusVisible(page, 'static front door');
});

const STEP = 120;
const CONTROLS = ['Pause', 'Replay', '0.5×', '1×', 'Impatient'];
// The page's height and the board's one sheet, marked at idle so a remount would lose the mark.
const measure = (page: Page) =>
  page.evaluate(() => ({
    height: document.documentElement.scrollHeight,
    marked: document.querySelectorAll('section[aria-label="The board"] svg[data-stage-mark]').length,
  }));

for (const { width, height } of [
  { width: 1440, height: 900 },
  { width: PHONE, height: 844 },
]) {
  test(`the static stage at ${width} plays the verified recording on its one board, the page never growing`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width, height });
    await page.clock.install();
    await page.goto('/');
    const file = page.getByRole('button', { name: FILE });
    await expect(file).toBeEnabled();
    const fileBox = await file.boundingBox();
    expect(fileBox && fileBox.y + fileBox.height).toBeLessThanOrEqual(height);
    await expect(page.getByRole('button')).toHaveText(['Voice on', 'Skip voice', FILE, ...CONTROLS]);
    const board = page.getByRole('region', { name: 'The board' });
    await expect(board.getByText('Gemma 4 E4B · Ollama · Recorded', { exact: true })).toBeVisible();
    await expect(board.getByRole('img', { name: 'The empty board' })).toBeVisible();
    await expect(board.getByText('The ridiculous machinery appears here.', { exact: true })).toBeVisible();
    const result = board.getByRole('region', { name: 'Simulation result' });
    const resultBox = await result.boundingBox();
    if (width === 1440) expect(resultBox && resultBox.y + resultBox.height).toBeLessThanOrEqual(height);
    await expect(page.getByRole('region', { name: 'The gallery' })).toBeHidden();
    await board.locator('svg[role="img"]').evaluate((el) => el.setAttribute('data-stage-mark', ''));
    const idle = await measure(page);

    // Each state is held still while it is looked at: the same sheet, the same page height, nothing wider than the
    // screen, axe clean, and a picture kept as a report attachment, never compared or committed.
    const look = async (state: string) => {
      expect(await measure(page), `${state} at ${width}`).toEqual(idle);
      await expectNoOverflow(page);
      if (width <= PHONE) await expectTargets(page);
      await expectAxeClean(page, `static stage ${state} at ${width}`);
      const path = testInfo.outputPath(`static-stage-${state}-${width}.png`);
      await page.screenshot({ path, animations: 'disabled' });
      await testInfo.attach(`static-stage-${state}-${width}`, { path, contentType: 'image/png' });
    };
    const pause = page.getByRole('button', { name: 'Pause' });
    const hold = async (state: string) => {
      await pause.click();
      await expect(pause).toHaveAttribute('aria-pressed', 'true');
      await page.clock.resume();
      await look(state);
      await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 1000);
      await pause.click();
    };
    // The page clock steps the recording until the board shows what is wanted.
    const until = async (shown: () => Promise<boolean>) => {
      for (let i = 0; i < 400 && !(await shown()); i += 1) await page.clock.runFor(STEP);
      expect(await shown()).toBe(true);
    };
    await look('idle');

    const address = page.url();
    await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 1000);
    await file.click();
    const status = page.getByRole('status');
    await expect(status).toHaveText('Trial 1 in progress.');
    await expect(status).toBeFocused();
    // The trial selector follows the playhead: the trial in progress is the one shown.
    const trial = async (n: number) => {
      await expect(status).toHaveText(`Trial ${n} in progress.`);
      await expect(board.getByRole('button', { name: new RegExp(`^Trial ${n},`) })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
    };
    // The recording's first trial is refused before the ball moves, so the ball runs in trial 2, its first repair.
    await until(async () => (await status.textContent()) === 'Trial 2 in progress.');
    await page.clock.runFor(STEP * 3);
    await trial(2);
    await hold('simulating');

    // Trial 3 is the second repair, marked on its own board.
    await until(async () => (await status.textContent()) === 'Trial 3 in progress.');
    await trial(3);
    await expect(board.locator('[data-change]').first()).toBeAttached();
    await hold('repair');

    // The ending: at the press's hard cut the pinned result turns PRESSED, with the verdict.
    const stamp = result.locator('[data-stamp]');
    await until(async () => (await stamp.textContent()) === 'PRESSED');
    await page.clock.resume();
    await look('verdict');
    expect(page.url()).toBe(address);
  });
}

test('a gallery record with a one-letter title still links through a 52 px target on a phone', async ({
  page,
}) => {
  await page.route('**/gallery/scenic.json', async (route) => {
    const record = Build.parse(await (await route.fetch()).json());
    await route.fulfill({ json: { ...record, title: 'I' } });
  });
  await page.setViewportSize({ width: PHONE, height: 844 });
  await page.goto('/');
  await page.getByText('The gallery', { exact: true }).click();
  await expect(page.getByRole('link', { name: 'I', exact: true })).toBeVisible();
  await expectTargets(page);
});

for (const viewport of VIEWPORTS) {
  test(`the front door fits at ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const shown = viewport.width <= PHONE_RIG ? 'phone' : 'desk';
    const hidden = shown === 'phone' ? 'desk' : 'phone';
    await expect(page.locator(`svg[data-variant="${shown}"]`)).toBeVisible();
    await expect(page.locator(`svg[data-variant="${hidden}"]`)).toBeHidden();
    await expect(page.getByText(CLOSED)).toBeVisible();
    await expectNoOverflow(page);
    if (viewport.width <= PHONE) await expectTargets(page);
  });
}
