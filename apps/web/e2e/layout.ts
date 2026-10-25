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
  const { viewport, scrollWidth, widest, furthest } = await page.evaluate(() => {
    const elements = [...document.body.querySelectorAll('*')];
    const boxes = elements.map((el) => {
      const box = el.getBoundingClientRect();
      return { tag: `${el.tagName}.${el.getAttribute('class') ?? ''}`, width: box.width, right: box.right };
    });
    const none = { tag: 'none', width: 0, right: 0 };
    return {
      viewport: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      widest: boxes.reduce((a, b) => (b.width > a.width ? b : a), none),
      furthest: boxes.reduce((a, b) => (b.right > a.right ? b : a), none),
    };
  });
  expect(scrollWidth, `${furthest.tag} ends at ${furthest.right}`).toBeLessThanOrEqual(viewport);
  expect(widest.width, `${widest.tag} is wider than the viewport`).toBeLessThanOrEqual(viewport);
}

// On a phone every visible control is at least 52 px each way (character sheet section 8), links in running text too.
export const PHONE = 390;

// The six widths in both orientations, 400 percent zoom (1280 x 1024 at 400 percent is 320 x 256 CSS px) and 200
// percent text (the browser's default font size doubled).
export const LAYOUTS = [
  ...VIEWPORTS.map((v) => ({ ...v, text: 16 })),
  { name: '400 percent zoom', width: 320, height: 256, text: 16 },
  { name: '200 percent text at 1440', width: 1440, height: 900, text: 32 },
  { name: '200 percent text at 390', width: PHONE, height: 844, text: 32 },
];
const CONTROLS = 'a[href], button, input, select, textarea';

export async function expectTargets(page: Page) {
  const small = await page.evaluate((selector) => {
    const visible = (el: Element) => el.checkVisibility({ visibilityProperty: true, opacityProperty: false });
    return [...document.querySelectorAll(selector)]
      .filter(visible)
      .map((el) => ({ el, box: el.getBoundingClientRect() }))
      .filter(({ box }) => box.width < 52 || box.height < 52)
      .map(({ el, box }) => `${el.tagName} "${el.textContent?.slice(0, 30)}" ${box.width}x${box.height}`);
  }, CONTROLS);
  expect(small).toEqual([]);
}

// Tab walks every focusable element of the page once, and each shows a focus indicator of at least 2 px.
export async function expectFocusVisible(page: Page, label: string) {
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
  const seen: string[] = [];
  for (let i = 0; i < 200; i += 1) {
    await page.keyboard.press('Tab');
    const focused = await page.evaluate(() => {
      const el = document.activeElement;
      if (el === null || el === document.body) return undefined;
      const style = getComputedStyle(el);
      return {
        key: `${el.tagName}#${[...document.querySelectorAll('*')].indexOf(el)}`,
        name: `${el.tagName} "${el.textContent?.slice(0, 30) ?? ''}"`,
        outline: style.outlineStyle === 'none' ? 0 : Number.parseFloat(style.outlineWidth),
      };
    });
    if (focused === undefined || seen.includes(focused.key)) break;
    seen.push(focused.key);
    expect(focused.outline, `${focused.name} has no visible focus`).toBeGreaterThanOrEqual(2);
  }
  process.stdout.write(`focus ${label}: ${seen.length} tab stops, each with a visible indicator\n`);
  expect(seen.length).toBeGreaterThan(0);
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
