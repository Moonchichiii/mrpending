// @vitest-environment node
import { describe, expect, test } from 'vitest';
import config, { loopbackClient } from '../vite.config';

describe('the /api dev proxy', () => {
  // The agent refuses a build whose Host is not its own bound address, so the proxy must not pass the page's on.
  test('sends the agent its own host, 127.0.0.1:4111', () => {
    const api = config({ mode: 'development', command: 'serve' }).server?.proxy?.['/api'];
    expect(typeof api === 'object' && api.target === 'http://127.0.0.1:4111' && api.changeOrigin).toBe(true);
  });

  test.each(['127.0.0.1', '127.8.9.10', '::1', '::ffff:127.0.0.1'])(
    'forwards a loopback browser at %s',
    (address) => {
      expect(loopbackClient(address)).toBe(true);
    },
  );

  test.each(['192.168.1.20', '10.0.0.5', '::ffff:192.168.1.20', 'fe80::1', '127.example.com', '', undefined])(
    'refuses a remote or unknown browser at %s',
    (address) => {
      expect(loopbackClient(address)).toBe(false);
    },
  );
});
