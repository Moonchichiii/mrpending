import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

// The six widths are test cases, not breakpoints; each is held in portrait and in landscape.
const WIDTHS = [320, 375, 390, 768, 1024, 1440];
export const VIEWPORTS = WIDTHS.flatMap((width) => [
  { name: `${width} portrait`, width, height: Math.round((width * 16) / 9) },
  { name: `${width} landscape`, width, height: Math.round((width * 9) / 16) },
]);

// No horizontal page overflow, and no element wider than the viewport.
export async function expectNoOverflow(page: Page) {
  const { viewport, scrollWidth, widest } = await page.evaluate(() => {
    const elements = [...document.body.querySelectorAll('*')];
    const widths = elements.map((el) => ({ tag: el.tagName, width: el.getBoundingClientRect().width }));
    return {
      viewport: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      widest: widths.reduce((a, b) => (b.width > a.width ? b : a), { tag: 'none', width: 0 }),
    };
  });
  expect(scrollWidth).toBeLessThanOrEqual(viewport);
  expect(widest.width, `${widest.tag} is wider than the viewport`).toBeLessThanOrEqual(viewport);
}

// WCAG 2.2 A and AA plus the AAA rules axe implements (enhanced contrast among them), on the page or on the part of it
// that `include` selects. The summary line is the evidence the issue asks for.
export async function expectAxeClean(page: Page, label: string, include?: string) {
  const axe = new AxeBuilder({ page }).withTags([
    'wcag2a',
    'wcag2aa',
    'wcag21a',
    'wcag21aa',
    'wcag22aa',
    'wcag2aaa',
  ]);
  const { violations, passes, incomplete } = await (include ? axe.include(include) : axe).analyze();
  process.stdout.write(
    `axe ${label}: ${violations.length} violations, ${passes.length} rules passed, ${incomplete.length} incomplete` +
      `${incomplete.map((r) => ` ${r.id} (${r.nodes.length} nodes)`).join(',')}\n`,
  );
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
}
