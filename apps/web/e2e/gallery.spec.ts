import { expect, test } from '@playwright/test';
import { VIEWPORTS, expectAxeClean, expectNoOverflow } from './layout';

// The harness renders the front door with four gallery records at every schema maximum.
test('the gallery with longest-legal records is axe clean', async ({ page }) => {
  await page.goto('/e2e/harness.html');
  await expect(page.getByRole('listitem')).toHaveCount(4);
  await expectAxeClean(page, 'gallery with longest-legal records');
});

for (const viewport of VIEWPORTS) {
  test(`the gallery with longest-legal records fits at ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/e2e/harness.html');
    await expect(page.getByRole('heading', { level: 3, name: 'W'.repeat(40) }).first()).toBeVisible();
    await expectNoOverflow(page);
  });
}
