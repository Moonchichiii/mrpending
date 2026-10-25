import type { Locator, Page } from '@playwright/test';
import { expect, test } from '@playwright/test';
import { ATTEMPTS, FILE, FORM, NOTE, adjust, ndjson, open, recorded } from './build';
import {
  PHONE,
  VIEWPORTS,
  expectAxeClean,
  expectFocusVisible,
  expectNoOverflow,
  expectTargets,
} from './layout';

const STEP = 120;
// Trial 1 is lost on its last step; trial 2 reaches the button on its press step, then the press clock runs.
const LOST_AT = Math.max(...(ATTEMPTS[0]?.events.map((e) => e.step) ?? [0]));
const PRESS_AT = ATTEMPTS[1]?.events.find((e) => e.type === 'button.pressed')?.step ?? 0;

const STATES = ['drawing', 'running', 'failure', 'diff', 'press', 'verdict', 'report', 'department'] as const;
type State = (typeof STATES)[number];

// One build from filing to My department on the page clock, held still on each state while `at` looks at it.
// The agent's answer waits until the drawing state has been seen; the playback is paused on each running state.
async function walk(page: Page, at: (state: State) => Promise<void>, longest = false) {
  await page.clock.install();
  await open(page);
  let release = () => {};
  const answered = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/build', async (route) => {
    await answered;
    await route.fulfill({ body: ndjson(recorded(route.request().headers()['x-request-id'] ?? '', longest)) });
  });
  if (longest) {
    await adjust(page);
    await page.getByLabel('1. Nature of the request').fill('W'.repeat(180));
  }
  await page.getByRole('button', { name: FILE }).click();
  const status = page.getByRole('status');
  const pause = page.getByRole('button', { name: 'Pause' });
  // The paused playback holds the state, so the page clock may run while `at` looks; it stops again before playback resumes.
  const hold = async (state: State) => {
    await pause.click();
    await expect(pause).toHaveAttribute('aria-pressed', 'true');
    await page.clock.resume();
    await at(state);
    await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 1000);
    await pause.click();
  };

  await expect(status).toHaveText(NOTE.designing);
  await at('drawing');
  await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 1000);
  release();
  await expect(status).toHaveText(NOTE.testing);
  await page.clock.runFor(STEP * 2);
  await hold('running');
  await page.clock.runFor(STEP * (LOST_AT - 2));
  await expect(page.locator('[data-failure][data-cell="L3"]')).toHaveCount(1);
  await hold('failure');
  await page.clock.runFor(STEP * 2);
  await expect(status).toHaveText(NOTE.retesting);
  await expect(page.locator('[data-change="removed"]')).toHaveCount(1);
  await hold('diff');
  // Into the press clock's excited beat, 0.90 s after the tick that reaches the button; the press is the last step,
  // so the build has ended and only the page clock holds the sequence, which is still running after the look.
  await page.clock.runFor(STEP * (PRESS_AT - 1) + 1000);
  const sequence = page.locator('[data-press="sequence"]');
  await expect(sequence).toHaveCount(1);
  await at('press');
  await expect(sequence).toHaveCount(1);
  await page.clock.runFor(1000);
  const result = page.getByRole('region', { name: 'Simulation result' });
  await expect(result.locator('[data-stamp]')).toHaveText('PRESSED');
  await page.clock.resume();
  await at('verdict');
  // The Engineering Report waits in the Minutes, folded under the board.
  await page.getByText('Minutes', { exact: true }).click();
  const report = page.getByRole('region', { name: 'Engineering Report' });
  await expect(report).toBeVisible();
  await at('report');
  await page.getByText('My department').click();
  await page
    .getByRole('region', { name: 'My department' })
    .getByRole('heading', { level: 3 })
    .first()
    .scrollIntoViewIfNeeded();
  await at('department');
}

// axe drives its checks with timers. Only the press is held by a stopped page clock, so there the clock is stepped a
// millisecond at a time until axe is done, well inside the press's excited beat.
const axeAt = (page: Page, label: string) => async (state: State) => {
  if (state !== 'press') return expectAxeClean(page, `${label} ${state}`);
  let settled = false;
  const run = expectAxeClean(page, `${label} ${state}`).finally(() => {
    settled = true;
  });
  while (!settled) await page.clock.runFor(1);
  await run;
};

test('every state of a build is axe clean', async ({ page }) => {
  test.setTimeout(60_000);
  await walk(page, axeAt(page, 'desktop'));
});

test('every state of a build is axe clean on a phone', async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: PHONE, height: 844 });
  await walk(page, axeAt(page, 'phone'));
});

test('a gallery record page is axe clean on desktop and on a phone', async ({ page }) => {
  for (const width of [1440, PHONE]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/r/scenic');
    await expect(
      page.getByRole('heading', { level: 3, name: 'Button Pressing Apparatus Design' }),
    ).toBeVisible();
    await expectAxeClean(page, `record page at ${width}`);
  }
});

// The six widths in both orientations, 400 percent zoom (1280 x 1024 at 400 percent is 320 x 256 CSS px) and 200
// percent text (the browser's default font size doubled), each with the longest legal text on every state.
const LAYOUTS = [
  ...VIEWPORTS.map((v) => ({ ...v, text: 16 })),
  { name: '400 percent zoom', width: 320, height: 256, text: 16 },
  { name: '200 percent text at 1440', width: 1440, height: 900, text: 32 },
  { name: '200 percent text at 390', width: PHONE, height: 844, text: 32 },
];

for (const layout of LAYOUTS) {
  test(`every state of a build with its longest text fits at ${layout.name}`, async ({
    page,
    browserName,
  }) => {
    test.setTimeout(60_000);
    await page.setViewportSize(layout);
    if (layout.text !== 16) {
      test.skip(browserName !== 'chromium', 'the default font size is set through the Chromium protocol');
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Page.setFontSizes', { fontSizes: { standard: layout.text, fixed: layout.text } });
    }
    await walk(
      page,
      async (state) => {
        await expectNoOverflow(page);
        if (layout.width <= PHONE) await expectTargets(page);
        // The pinned result stays on the board with the longest text: it ends inside the board's frame.
        if (state === 'verdict')
          expect(
            await page.getByRole('region', { name: 'Simulation result' }).evaluate((el) => {
              const board = el.closest('section[aria-label="The board"]');
              return (
                board !== null && el.getBoundingClientRect().bottom <= board.getBoundingClientRect().bottom
              );
            }),
          ).toBe(true);
      },
      true,
    );
  });

  test(`a gallery record page fits at ${layout.name}`, async ({ page, browserName }) => {
    await page.setViewportSize(layout);
    if (layout.text !== 16) {
      test.skip(browserName !== 'chromium', 'the default font size is set through the Chromium protocol');
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Page.setFontSizes', { fontSizes: { standard: layout.text, fixed: layout.text } });
    }
    await page.goto('/r/scenic');
    await expect(
      page.getByRole('heading', { level: 3, name: 'Button Pressing Apparatus Design' }),
    ).toBeVisible();
    await expectNoOverflow(page);
    if (layout.width <= PHONE) await expectTargets(page);
  });
}

// Tab (or Shift+Tab) from wherever focus is until the target has it; the page has far fewer than 100 stops.
async function tabTo(page: Page, target: Locator, key = 'Tab') {
  for (let i = 0; i < 100 && !(await target.evaluate((el) => el === document.activeElement)); i += 1)
    await page.keyboard.press(key);
  await expect(target).toBeFocused();
}

test('a build is filed, watched, paused, saved and filed again with the keyboard alone, focus always visible', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await open(page);
  await expectFocusVisible(page, 'form');
  await page.route('**/api/build', (route) =>
    route.fulfill({ body: ndjson(recorded(route.request().headers()['x-request-id'] ?? '')) }),
  );
  // After the voice the button is the next stop, then past the board and the Minutes the form's fold, which opens by
  // keyboard; the request is rewritten in item 1.
  const file = page.getByRole('button', { name: FILE });
  await tabTo(page, file);
  await tabTo(page, page.getByText('Advanced settings'));
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('1. Nature of the request')).toBeFocused();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type(FORM.nature);
  await tabTo(page, file, 'Shift+Tab');
  await page.keyboard.press('Enter');

  // Focus moves to the status; Space pauses the machine from there, and every control is then walked by Tab.
  const status = page.getByRole('status');
  const pause = page.getByRole('button', { name: 'Pause' });
  await expect(status).toHaveText(NOTE.testing);
  await expect(status).toBeFocused();
  await page.keyboard.press(' ');
  await expect(pause).toHaveAttribute('aria-pressed', 'true');
  await expectFocusVisible(page, 'board paused');
  await tabTo(page, pause);
  await page.keyboard.press('Enter');
  await expect(pause).toHaveAttribute('aria-pressed', 'false');
  const impatient = page.getByRole('button', { name: 'Impatient' });
  await tabTo(page, impatient);
  await page.keyboard.press('Enter');
  await expect(impatient).toHaveAttribute('aria-pressed', 'true');

  const result = page.getByRole('region', { name: 'Simulation result' });
  await expect(result.locator('[data-stamp]')).toHaveText('PRESSED', { timeout: 20_000 });
  await expectFocusVisible(page, 'verdict');
  // The Minutes open by keyboard, and Save as image in them saves the Engineering Report.
  await tabTo(page, page.locator('summary', { hasText: /^Minutes$/ }));
  await page.keyboard.press('Enter');
  await tabTo(page, page.getByRole('button', { name: 'Save as image' }));
  const [download] = await Promise.all([page.waitForEvent('download'), page.keyboard.press('Enter')]);
  expect(download.suggestedFilename()).toBe('mr-pending-b1.png');
  // The one button, back up the page, files the request as it stands once more.
  await tabTo(page, file, 'Shift+Tab');
  await page.keyboard.press('Enter');
  await expect(status).toBeFocused();
  await expect(page.getByLabel('1. Nature of the request')).toHaveValue(FORM.nature);
});
