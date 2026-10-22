import { expect, test } from 'vitest';
import type { Infer } from '@pending/agent';
import { sampled } from './host';

test('a rejected inference call still records its memory reading', async () => {
  const mem = { minFreeMiB: Number.POSITIVE_INFINITY };
  const infer: Infer = async () => {
    throw new Error('timed out');
  };
  const call = { kind: 'design' as const, system: '', prompt: '' };
  await expect(sampled(infer, mem)(call, new AbortController().signal)).rejects.toThrow('timed out');
  expect(Number.isFinite(mem.minFreeMiB)).toBe(true);
});
