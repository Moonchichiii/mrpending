import { Build } from '@pending/contract';
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

test('the static front door is the same one screen, and its button plays the verified recording in place', async ({
  page,
}, testInfo) => {
  for (const { width, height } of [
    { width: 1440, height: 900 },
    { width: PHONE, height: 844 },
  ]) {
    await page.setViewportSize({ width, height });
    await page.goto('/');
    const file = page.getByRole('button', { name: FILE });
    await expect(file).toBeEnabled();
    const fileBox = await file.boundingBox();
    expect(fileBox && fileBox.y + fileBox.height).toBeLessThanOrEqual(height);
    await expect(page.getByRole('button')).toHaveText(['Mute', 'Skip voice', FILE]);
    const board = page.getByRole('region', { name: 'The board' });
    await expect(board.getByText('Gemma 4 E4B · Ollama · recorded', { exact: true })).toBeVisible();
    await expect(board.getByRole('img', { name: 'The empty board' })).toBeVisible();
    await expect(board.getByText('The ridiculous machinery appears here.', { exact: true })).toBeVisible();
    const level = board.getByText('Gemma designs → Simulator tests → Gemma repairs', { exact: true });
    const levelBox = await level.boundingBox();
    if (width === 1440) expect(levelBox && levelBox.y + levelBox.height).toBeLessThanOrEqual(height);
    await expect(page.getByRole('region', { name: 'The gallery' })).toBeHidden();
    await expectNoOverflow(page);
    await expectAxeClean(page, `static one-screen front door at ${width}`);
    const path = testInfo.outputPath(`static-first-screen-${width}.png`);
    await page.screenshot({ path, animations: 'disabled' });
    await testInfo.attach(`static-first-screen-${width}`, { path, contentType: 'image/png' });
  }

  const address = page.url();
  await page.getByRole('button', { name: FILE }).click();
  const status = page.getByRole('status');
  await expect(status).toHaveText('Trial 1 in progress.');
  await expect(status).toBeFocused();
  await expect(page.getByRole('region', { name: 'The board' }).getByRole('figure')).toContainText('Trial 1');
  expect(page.url()).toBe(address);
});

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
