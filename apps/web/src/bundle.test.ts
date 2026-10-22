// @vitest-environment node
import { build } from 'vite';
import { afterEach, describe, expect, test, vi } from 'vitest';

const root = decodeURIComponent(new URL('..', import.meta.url).pathname);

// Builds the production bundle in memory with the real config and returns every emitted file's text.
async function bundle(mode: 'static' | 'local'): Promise<string> {
  vi.stubEnv('VITE_SITE_MODE', mode);
  const result = await build({ root, logLevel: 'silent', build: { write: false } });
  const outputs = (Array.isArray(result) ? result : [result]).flatMap((r) => ('output' in r ? r.output : []));
  return outputs
    .map((file) => (file.type === 'chunk' ? file.code : typeof file.source === 'string' ? file.source : ''))
    .join('\n');
}

afterEach(() => vi.unstubAllEnvs());

describe('site modes', () => {
  test('the static bundle contains no /api reference at all', { timeout: 60_000 }, async () => {
    const text = await bundle('static');
    expect(text).toContain('Watch Mr. Pending at work');
    expect(text).not.toContain('/api');
    expect(text).not.toContain('Form 27B/6 rejected');
  });

  test('the local bundle calls the build and config routes', { timeout: 60_000 }, async () => {
    const text = await bundle('local');
    expect(text).toContain('/api/build');
    expect(text).toContain('/api/config');
  });
});
