import { Build } from '@pending/contract';
import { expect, test } from '@playwright/test';
import {
  PHONE,
  VIEWPORTS,
  expectAxeClean,
  expectFocusVisible,
  expectNoOverflow,
  expectTargets,
} from './layout';

const CLOSED = 'The Department is closed to new applications. The archive is open.';
const HEADLINE = 'This archive replays recorded builds. It takes no requests.';
// The stylesheet's phone width (40rem at the default 16 px) shows the head alone; wider viewports show the full rig.
const PHONE_RIG = 640;

test('the static front door makes no API call', async ({ page }) => {
  const api: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/api')) api.push(request.url());
  });
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Watch Mr. Pending at work' })).toBeVisible();
  await expect(page.getByText(HEADLINE)).toBeVisible();
  // Mr. Pending is at the closed counter from the first paint, in the slow mood.
  await expect(page.getByText(CLOSED)).toBeVisible();
  await expect(page.locator('svg[data-variant="desk"]')).toHaveClass(/slow/);
  expect(api).toEqual([]);
  await expectAxeClean(page, 'static front door');
  await expectFocusVisible(page, 'static front door');
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
    await expect(page.getByText(HEADLINE)).toBeVisible();
    // The gallery's cards lead with their recorded final attempts.
    await expect(page.locator('[data-thumbnail]').first()).toBeVisible();
    await expectNoOverflow(page);
    if (viewport.width <= PHONE) await expectTargets(page);
  });
}
