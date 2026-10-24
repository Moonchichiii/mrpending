import { Build } from '@pending/contract';
import type { APIRequestContext, Page } from '@playwright/test';
import { expect, test } from '@playwright/test';
import { env } from 'node:process';
import { expectAxeClean } from '../e2e/layout';

// SECURITY-AND-FAILURE-CONTRACT section 7, plus noindex while the preview is unlisted.
const HEADERS = {
  'content-security-policy':
    "default-src 'self'; connect-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; font-src 'self'; frame-ancestors 'none'",
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': 'microphone=()',
  'x-robots-tag': 'noindex',
};
// The host may send a stronger HSTS policy than ours; its max-age must still be at least a year.
const HSTS_MIN_AGE = 31536000;
const REPLAYS = ['budget', 'scenic', 'windless'];

const record = async (request: APIRequestContext, slug: string) =>
  Build.parse(await (await request.get(`/gallery/${slug}.json`)).json());

const maxAge = (hsts: string | undefined) => {
  const directive = hsts
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => /^max-age=/i.test(part));
  const match = /^max-age="?(\d+)"?$/i.exec(directive ?? '');
  return match ? Number(match[1]) : Number.NaN;
};

// Every request the page makes leaves this origin or reaches /api, or the CSP refuses something: each is a failure.
function watch(page: Page, origin: string) {
  const strays: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.origin !== origin || url.pathname.startsWith('/api')) strays.push(request.url());
  });
  page.on('console', (message) => {
    if (/Content Security Policy/i.test(message.text())) strays.push(message.text());
  });
  return strays;
}

test('the host answers every kind of path with the contract headers and noindex', async ({ request }) => {
  for (const path of ['/', '/r/budget', '/r/elsewhere', '/gallery/budget.json']) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(200);
    for (const [name, value] of Object.entries(HEADERS))
      expect(response.headers()[name], `${path} ${name}`).toBe(value);
    expect(
      maxAge(response.headers()['strict-transport-security']),
      `${path} strict-transport-security`,
    ).toBeGreaterThanOrEqual(HSTS_MIN_AGE);
  }
});

// The console check of section 7: the browser itself refuses what the policy forbids and reports each refusal.
test('the browser enforces the policy: another origin and an inline script are refused in the console', async ({
  page,
}) => {
  const refusals: string[] = [];
  page.on('console', (message) => {
    if (/Content Security Policy/i.test(message.text())) refusals.push(message.text());
  });
  await page.goto('/');
  const outcome = await page.evaluate(async () => {
    const fetched = await fetch('https://example.com/').then(
      () => 'sent',
      () => 'refused',
    );
    const script = document.createElement('script');
    script.textContent = 'document.body.dataset["inline"] = "ran";';
    document.body.append(script);
    return { fetched, inline: document.body.dataset['inline'] ?? 'refused' };
  });
  expect(outcome).toEqual({ fetched: 'refused', inline: 'refused' });
  await expect.poll(() => refusals.length).toBeGreaterThanOrEqual(2);
});

test('the static deployment has no agent behind it', async ({ request }) => {
  for (const path of ['/api/config', '/api/build'])
    expect((await request.get(path)).status(), path).toBe(404);
});

test('the front door plays a recording, folds the gallery away, names its commit and asks nothing of anyone else', async ({
  page,
  baseURL,
}) => {
  const strays = watch(page, new URL(baseURL ?? '').origin);
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Press the button' })).toBeEnabled();
  await page.getByText('The gallery', { exact: true }).click();
  await expect(page.getByRole('region', { name: 'The gallery' }).getByRole('listitem')).toHaveCount(5);
  const build = page.getByRole('contentinfo').getByRole('link', { name: /^[0-9a-f]{12}$/ });
  await expect(build).toHaveAttribute(
    'href',
    new RegExp(`/commit/${env['SMOKE_COMMIT'] ?? '[0-9a-f]{40}'}$`),
  );
  await expectAxeClean(page, 'preview front door');
  expect(strays).toEqual([]);
});

for (const slug of REPLAYS) {
  test(`/r/${slug} replays the record with working controls`, async ({ page, request, baseURL }) => {
    const { title } = await record(request, slug);
    const strays = watch(page, new URL(baseURL ?? '').origin);
    await page.goto(`/r/${slug}`);
    const article = page.getByRole('article', { name: title });
    await expect(article.getByRole('status')).toHaveText('Trial 1 in progress.');
    const pause = article.getByRole('button', { name: 'Pause' });
    await pause.click();
    await expect(pause).toHaveAttribute('aria-pressed', 'true');
    await pause.click();
    await expect(pause).toHaveAttribute('aria-pressed', 'false');
    const impatient = article.getByRole('button', { name: 'Impatient' });
    await impatient.click();
    await expect(impatient).toHaveAttribute('aria-pressed', 'true');
    expect(strays).toEqual([]);
  });
}

test('a missing record is answered by the page, which shows the gallery instead of a host error', async ({
  page,
}) => {
  const response = await page.goto('/r/elsewhere');
  expect(response?.status()).toBe(200);
  await expect(page.getByRole('region', { name: 'The gallery' }).getByRole('listitem')).toHaveCount(5);
  await expect(page.getByRole('article')).toHaveCount(0);
});

test.describe('with reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('the report card states the recomputed outcome once the record has played', async ({
    page,
    request,
  }) => {
    const { title, report } = await record(request, 'budget');
    await page.goto('/r/budget');
    const article = page.getByRole('article', { name: title });
    await expect(article.getByRole('status')).toHaveText(report.verdict);
    // The result pinned on the board is stamped, and the report card in the closed Minutes carries the outcome.
    const result = article.getByRole('region', { name: 'Simulation result' });
    await expect(result.getByText(report.pressed ? 'PRESSED' : 'PENDING', { exact: true })).toBeVisible();
    await expect(
      article
        .getByRole('region', { name: 'Engineering Report', includeHidden: true })
        .locator('svg[data-shape="landscape"] [data-stamp]'),
    ).toHaveAttribute('data-stamp', report.pressed ? 'APPROVED' : 'PENDING');
    await expect(
      article.getByText(new RegExp(`^${report.attempts} trials? · ${report.parts} parts?`)),
    ).toBeVisible();
    await expect(article.getByRole('button', { name: 'Replay' })).toBeEnabled();
    await expectAxeClean(page, 'preview report card');
  });
});
