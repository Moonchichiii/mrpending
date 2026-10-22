import { expect, test } from 'vitest';
import { RULES_VERSION } from '@pending/machine';
import { healthz } from './index';

test('agent resolves machine through the workspace', () => {
  expect(healthz()).toEqual({ ok: true, rulesVersion: RULES_VERSION });
});
