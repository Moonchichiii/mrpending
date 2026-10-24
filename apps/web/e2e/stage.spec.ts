import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Line } from '@pending/contract';
import type { StreamEvent } from '@pending/contract';
import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';
import { ATTEMPTS, FILE, open, recorded } from './build';
import { PHONE, expectAxeClean, expectNoOverflow, expectTargets } from './layout';

const STEP = 120;
// Trial 1 is lost on its last step; trial 2 reaches the button on its press step, then the press clock runs.
const LOST_AT = Math.max(...(ATTEMPTS[0]?.events.map((e) => e.step) ?? [0]));
const PRESS_AT = ATTEMPTS[1]?.events.find((e) => e.type === 'button.pressed')?.step ?? 0;
// The pictures the maintainer compares by eye with e2e/reference/stage.png; never compared by a test.
const SHOTS = fileURLToPath(new URL('./__screenshots__/', import.meta.url));

const SCREENS = [
  { width: 1440, height: 900 },
  { width: PHONE, height: 844 },
] as const;

// The agent's answer as a stream the test writes to, through the page's own build client: /api/build answers with a
// body that stays open, and each `build-event` the test dispatches is one NDJSON line, stamped with the request's id.
async function heldStream(page: Page) {
  await page.addInitScript(() => {
    const encoder = new TextEncoder();
    const real = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const url = input instanceof Request ? input.url : String(input);
      if (!url.endsWith('/api/build')) return real(input, init);
      const requestId = new Headers(init?.headers).get('x-request-id') ?? '';
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          window.addEventListener('build-event', (event) => {
            if (!(event instanceof CustomEvent) || typeof event.detail !== 'string') return;
            controller.enqueue(
              encoder.encode(`${event.detail.replaceAll('"REQUEST"', JSON.stringify(requestId))}\n`),
            );
          });
        },
      });
      return Promise.resolve(new Response(body, { headers: { 'content-type': 'application/x-ndjson' } }));
    };
  });
  return (events: StreamEvent[]) =>
    page.evaluate(
      (lines) => {
        for (const detail of lines) window.dispatchEvent(new CustomEvent('build-event', { detail }));
      },
      events.map((e) => JSON.stringify(e)),
    );
}

const said = (id: string, beat: Line['beat'], text: string, attempt: number, step: number): StreamEvent => ({
  type: 'line',
  requestId: 'REQUEST',
  line: Line.parse({ id, beat, mood: 'slow', text, source: 'table', at: { attempt, step } }),
});

// The page's height and the board's one sheet, marked at idle so a remount would lose the mark.
const measure = (page: Page) =>
  page.evaluate(() => ({
    height: document.documentElement.scrollHeight,
    marked: document.querySelectorAll('section[aria-label="The board"] svg[data-stage-mark]').length,
  }));

for (const { width, height } of SCREENS) {
  test(`the illustrated stage at ${width}: idle, designing, simulating, failed, repairing and final on one board`, async ({
    page,
  }) => {
    test.setTimeout(90_000);
    mkdirSync(SHOTS, { recursive: true });
    await page.setViewportSize({ width, height });
    await page.clock.install();
    const send = await heldStream(page);
    await open(page);
    const board = page.getByRole('region', { name: 'The board' });
    await board.locator('svg[role="img"]').evaluate((el) => el.setAttribute('data-stage-mark', ''));
    const idle = await measure(page);

    // Each state is held still while it is looked at: the same sheet, the same page height, nothing wider than the
    // screen, axe clean, and the picture saved for the maintainer.
    const look = async (state: string) => {
      expect(await measure(page), `${state} at ${width}`).toEqual(idle);
      await expectNoOverflow(page);
      if (width <= PHONE) await expectTargets(page);
      await expectAxeClean(page, `stage ${state} at ${width}`);
      await page.screenshot({ path: `${SHOTS}stage-${state}-${width}.png`, animations: 'disabled' });
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
    const steps = board.getByRole('list', { name: 'Steps' });
    const current = steps.locator('[aria-current="step"]');
    const result = board.getByRole('region', { name: 'Simulation result' });

    // Idle: the one button, the model from /api/config on the board, every step to do, the result pending.
    const file = page.getByRole('button', { name: FILE });
    const fileBox = await file.boundingBox();
    expect(fileBox && fileBox.y + fileBox.height).toBeLessThanOrEqual(height);
    await expect(board.getByText('Gemma 4 E2B · Ollama · Running locally', { exact: true })).toBeVisible();
    await expect(board.getByText('Attempt 0 / 6')).toBeVisible();
    await expect(result.locator('[data-stamp]')).toHaveText('PENDING');
    await look('idle');
    if (width === 1440) {
      // The stage fills the desktop screen: the board's steps and result inside it, the sheet a good size.
      const resultBox = await result.boundingBox();
      expect(resultBox && resultBox.y + resultBox.height).toBeLessThanOrEqual(height);
      const sheetBox = await board.locator('svg[role="img"]').boundingBox();
      expect(sheetBox?.height).toBeGreaterThanOrEqual(280);
    }

    // Designing: the request is filed and Mr. Pending says his line while the title is drafted.
    await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 1000);
    await file.click();
    const status = page.getByRole('status');
    await expect(status).toHaveText('Drafting. Please do not rush the Department.');
    await send([
      said('d1', 'designing', 'A button? I shall need an entire engineering department.', 1, 0),
      { type: 'partial', requestId: 'REQUEST', blueprint: { title: 'The Scenic Route' } },
    ]);
    await expect(page.getByRole('region', { name: 'Voice' }).locator('[aria-live="polite"]')).toHaveText(
      'A button? I shall need an entire engineering department.',
    );
    await expect(current).toHaveText(/Designing machine/);
    await page.clock.resume();
    await look('designing');
    await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 1000);

    // Simulating: trial 1 plays on the same board.
    const [first, second, done] = recorded('REQUEST');
    if (first === undefined || second === undefined || done === undefined) throw new Error('no recording');
    await send([first]);
    await expect(status).toHaveText('Trial 1 in progress.');
    await page.clock.runFor(STEP * 3);
    await expect(current).toHaveText(/Running simulation/);
    await hold('simulating');

    // Failed: the terminal step of trial 1, its failure ringed where it happened.
    await page.clock.runFor(STEP * (LOST_AT - 3));
    await expect(board.locator('[data-failure][data-cell="L3"]')).toHaveCount(1);
    await expect(current).toHaveText(/Result: failed/);
    await expect(result).toContainText('The button was not pressed. Gemma will try a repair.');
    await hold('failed');

    // Repairing: the trial has ended and the stream holds no correction yet.
    await page.clock.runFor(STEP * 2);
    await expect(current).toHaveText(/Repairing design/);
    await expect(board.getByText('Attempt 2 / 6')).toBeVisible();
    await page.clock.resume();
    await look('repairing');
    await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 1000);

    // Final: the repair is re-drawn in place, the ball presses the button, and at the press's hard cut the result
    // turns PRESSED with the verdict.
    await send([second, done]);
    await expect(status).toHaveText('Trial 2 in progress.');
    await expect(board.locator('[data-change="removed"]')).toHaveCount(1);
    await page.clock.runFor(STEP * PRESS_AT + 2000);
    await expect(result.locator('[data-stamp]')).toHaveText('PRESSED');
    await expect(status).toHaveText('One button. An extraordinary amount of paperwork.');
    await page.clock.resume();
    await look('final');

    // The Engineering Report and Save as image wait in the Minutes, folded under the board.
    await page.getByText('Minutes', { exact: true }).click();
    await expect(page.getByRole('region', { name: 'Engineering Report' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save as image' })).toBeVisible();
  });
}
