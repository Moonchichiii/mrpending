// @vitest-environment node
import { build } from 'vite';
import { afterEach, describe, expect, test, vi } from 'vitest';

const root = decodeURIComponent(new URL('..', import.meta.url).pathname);

// Builds the production bundle in memory with the real config and returns every emitted file's text.
async function bundle(mode: 'static' | 'local', commit = ''): Promise<string> {
  vi.stubEnv('VITE_SITE_MODE', mode);
  vi.stubEnv('VITE_COMMIT', commit);
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

  test(
    'the static bundle names the commit it was built from, and refuses anything but a full SHA',
    { timeout: 60_000 },
    async () => {
      const sha = 'a'.repeat(40);
      expect(await bundle('static', sha)).toContain(sha);
      await expect(bundle('static', 'main')).rejects.toThrow(
        'VITE_COMMIT must be a full commit SHA, not main',
      );
    },
  );
});
