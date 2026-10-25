import { Line } from '@pending/contract';
import type { StreamEvent } from '@pending/contract';
import { expect, test } from '@playwright/test';
import { FILE, ndjson, open, recorded } from './build';

const INTAKE =
  'Form 27B/6 received. Stamped, filed, placed on top of the other forms. This will take some time.';

test('a fixed line plays its clip after the press, the indicator moves, and Skip voice stops it', async ({
  page,
}) => {
  const clips: string[] = [];
  // The approved manifest and recordings are served as built; the clip requests are only observed.
  await page.route('**/voice/*.mp3', (route) => {
    clips.push(new URL(route.request().url()).pathname);
    return route.continue();
  });
  await open(page);
  await page.route('**/api/build', (route) => {
    const requestId = route.request().headers()['x-request-id'] ?? '';
    const line = Line.parse({
      id: 'intake',
      beat: 'intake',
      mood: 'slow',
      text: INTAKE,
      source: 'table',
      at: { attempt: 1, step: 0 },
    });
    const said: StreamEvent = { type: 'line', requestId, line };
    return route.fulfill({ body: ndjson([said, ...recorded(requestId)]) });
  });

  // Nothing is fetched or played before the visitor presses the button.
  const voice = page.getByRole('region', { name: 'Voice' });
  const indicator = voice.locator('[data-speaking="true"]');
  await expect(indicator).toHaveCount(0);
  expect(clips).toEqual([]);

  await page.getByRole('button', { name: FILE }).click();
  await expect(indicator).toBeVisible();
  expect(clips).toEqual(['/voice/intake.mp3']);
  await expect(voice.getByText(INTAKE)).toBeVisible();
  expect(
    await indicator
      .locator('line')
      .first()
      .evaluate((el) => getComputedStyle(el).animationName),
  ).not.toBe('none');

  await voice.getByRole('button', { name: 'Skip voice' }).click();
  await expect(indicator).toHaveCount(0);
  // The caption stays on the line that was skipped, and the clip is not requested again.
  await expect(voice.getByText(INTAKE)).toBeVisible();
  expect(clips).toEqual(['/voice/intake.mp3']);
});
