// @vitest-environment node
import { describe, expect, test } from 'vitest';
import { loopbackClient } from '../vite.config';

describe('the /api dev proxy', () => {
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
