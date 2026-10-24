import { expect, test } from '@playwright/test';
import { open } from './build';
import { VIEWPORTS, expectAxeClean, expectNoOverflow, expectTargets, PHONE } from './layout';

// The harness renders the front door with four gallery records at every schema maximum.
test('the gallery with longest-legal records is axe clean, each card led by its final attempt', async ({
  page,
}) => {
  await page.goto('/e2e/harness.html');
  const cards = page.getByRole('listitem');
  await expect(cards).toHaveCount(4);
  // The thumbnail, then the stamp, the verdict and the trials; the title is small text under them.
  const first = cards.first();
  await expect(first.locator(':scope > svg [data-thumbnail]')).toBeVisible();
  const [thumb, title] = [
    await first.locator(':scope > svg').boundingBox(),
    await first.getByRole('heading', { level: 3 }).boundingBox(),
  ];
  if (thumb === null || title === null) throw new Error('the card is not laid out');
  expect(title.y).toBeGreaterThan(thumb.y + thumb.height);
  await expectAxeClean(page, 'gallery with longest-legal records');
});

for (const viewport of VIEWPORTS) {
  test(`the gallery with longest-legal records fits at ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/e2e/harness.html');
    await expect(page.getByRole('heading', { level: 3, name: 'W'.repeat(40) }).first()).toBeVisible();
    await expect(page.locator('[data-thumbnail]')).toHaveCount(4);
    await expectNoOverflow(page);
  });
}

// Import and export are folded away below the gallery, closed until a visitor asks for them.
test('the records disclosure below the gallery is closed, opens, and is axe clean', async ({ page }) => {
  await open(page);
  const summary = page.getByText('Advanced: your records');
  await expect(page.getByLabel('Import a build (JSON, up to 512 KB)')).toBeHidden();
  const gallery = page.getByRole('region', { name: 'The gallery' });
  const [galleryBox, summaryBox] = [await gallery.boundingBox(), await summary.boundingBox()];
  if (galleryBox === null || summaryBox === null)
    throw new Error('the gallery or the records are not laid out');
  expect(summaryBox.y).toBeGreaterThanOrEqual(galleryBox.y + galleryBox.height);
  await expect(page.getByRole('region', { name: 'My department' })).toBeVisible();
  await summary.click();
  await expect(page.getByLabel('Import a build (JSON, up to 512 KB)')).toBeVisible();
  await expectAxeClean(page, 'records disclosure open');
});

for (const viewport of VIEWPORTS) {
  test(`the local front door with its records open fits at ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await open(page);
    await expect(page.locator('[data-thumbnail]').first()).toBeVisible();
    await page.getByText('Advanced: your records').click();
    await expect(page.getByLabel('Import a build (JSON, up to 512 KB)')).toBeVisible();
    await expectNoOverflow(page);
    if (viewport.width <= PHONE) await expectTargets(page);
  });
}
