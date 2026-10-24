import type { Page, TestInfo } from '@playwright/test';
import { expect, test } from '@playwright/test';
import { ATTEMPTS, FILE, ndjson, open, recorded } from './build';
import { PHONE, expectAxeClean, expectNoOverflow, expectTargets } from './layout';

const STEP = 120;
// Trial 1 is lost on its last step; trial 2 reaches the button on its press step, then the press clock runs.
const LOST_AT = Math.max(...(ATTEMPTS[0]?.events.map((e) => e.step) ?? [0]));
const PRESS_AT = ATTEMPTS[1]?.events.find((e) => e.type === 'button.pressed')?.step ?? 0;

const SCREENS = [
  { width: 1440, height: 900 },
  { width: PHONE, height: 844 },
] as const;

// The page's height and the board's one sheet, marked at idle so a remount would lose the mark.
const measure = (page: Page) =>
  page.evaluate(() => ({
    height: document.documentElement.scrollHeight,
    marked: document.querySelectorAll('section[aria-label="The board"] svg[data-stage-mark]').length,
  }));

for (const { width, height } of SCREENS) {
  test(`one persistent stage at ${width}: idle, simulating, repair and verdict on the same board, the page never growing`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width, height });
    await page.clock.install();
    await open(page);
    await page.route('**/api/build', (route) =>
      route.fulfill({ body: ndjson(recorded(route.request().headers()['x-request-id'] ?? '')) }),
    );
    const board = page.getByRole('region', { name: 'The board' });
    await board.locator('svg[role="img"]').evaluate((el) => el.setAttribute('data-stage-mark', ''));
    const idle = await measure(page);

    // Each state is held still while it is looked at: the same sheet, the same page height, nothing wider than the
    // screen, axe clean, and a picture kept as a report attachment, never compared or committed.
    const look = async (state: string) => {
      expect(await measure(page), `${state} at ${width}`).toEqual(idle);
      await expectNoOverflow(page);
      if (width <= PHONE) await expectTargets(page);
      await expectAxeClean(page, `stage ${state} at ${width}`);
      await shoot(page, testInfo, `stage-${state}-${width}`);
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

    // Idle: Mr. Pending large with his bubble, the button beside him, the board below with the model it will use.
    await expect(board.getByText('Gemma 4 E2B · Ollama · this machine', { exact: true })).toBeVisible();
    const file = page.getByRole('button', { name: FILE });
    const fileBox = await file.boundingBox();
    expect(fileBox && fileBox.y + fileBox.height).toBeLessThanOrEqual(height);
    if (width === 1440) {
      // The stage fills the desktop screen: the board, its level line and its fold all inside it.
      const level = board.getByText('Gemma designs → Simulator tests → Gemma repairs', { exact: true });
      const levelBox = await level.boundingBox();
      expect(levelBox && levelBox.y + levelBox.height).toBeLessThanOrEqual(height);
      const sheetBox = await board.locator('svg[role="img"]').boundingBox();
      expect(sheetBox?.height).toBeGreaterThanOrEqual(300);
    }
    await look('idle');

    await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 1000);
    await file.click();
    const status = page.getByRole('status');
    await expect(status).toHaveText('Trial 1 in progress.');
    await page.clock.runFor(STEP * 3);
    await hold('simulating');

    await page.clock.runFor(STEP * (LOST_AT - 3));
    await expect(board.locator('[data-failure][data-cell="L3"]')).toHaveCount(1);
    await page.clock.runFor(STEP * 2);
    await expect(status).toHaveText('Trial 2 in progress.');
    await expect(board.locator('[data-change="removed"]')).toHaveCount(1);
    await expect(board.getByRole('button', { name: 'Trial 2' })).toHaveAttribute('aria-pressed', 'true');
    await hold('repair');

    // Through the press clock's hard cut, where the verdict slides up over the board.
    await page.clock.runFor(STEP * (PRESS_AT - 1) + 2000);
    const verdict = board.getByRole('region', { name: 'Verdict' });
    await expect(verdict).toBeVisible();
    await page.clock.resume();
    await verdict.evaluate((el) => Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished)));
    await expect(verdict.getByRole('button', { name: 'Try again' })).toBeVisible();
    await expect(verdict.getByRole('button', { name: 'Save the report' })).toBeVisible();
    await look('verdict');

    // The Engineering Report opens on demand, over the page, and closes back to it.
    await verdict.getByRole('button', { name: 'Open the report' }).click();
    const report = page.getByRole('dialog', { name: 'Engineering Report' });
    await expect(
      report.locator(`svg[data-shape="${width <= 640 ? 'portrait' : 'landscape'}"]`),
    ).toBeVisible();
    await expectAxeClean(page, `engineering report dialog at ${width}`);
    await report.getByRole('button', { name: 'Close' }).click();
    await expect(report).toBeHidden();

    // Try again files the form once more, on the very same board.
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(status).toBeFocused();
    expect(await measure(page)).toEqual(idle);
  });
}

async function shoot(page: Page, testInfo: TestInfo, name: string) {
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path, animations: 'disabled' });
  await testInfo.attach(name, { path, contentType: 'image/png' });
}
