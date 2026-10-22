import { expect, test } from 'vitest';
import { healthz } from './index';

test('agent resolves machine through the workspace', () => {
  expect(healthz()).toEqual({ ok: true, rulesVersion: 'r1' });
});
