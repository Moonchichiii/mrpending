import { expect, test } from '@playwright/test';
import {
  PHONE,
  VIEWPORTS,
  expectAxeClean,
  expectFocusVisible,
  expectNoOverflow,
  expectTargets,
} from './layout';

test('the static front door makes no API call', async ({ page }) => {
  const api: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/api')) api.push(request.url());
  });
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Watch Mr. Pending at work' })).toBeVisible();
  expect(api).toEqual([]);
  await expectAxeClean(page, 'static front door');
  await expectFocusVisible(page, 'static front door');
});

for (const viewport of VIEWPORTS) {
  test(`the front door fits at ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expectNoOverflow(page);
    if (viewport.width <= PHONE) await expectTargets(page);
  });
}
