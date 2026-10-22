import { expect, test } from 'vitest';
import { CONTRACT_VERSION } from './index';

test('the contract version is a bounded ASCII id', () => {
  expect(CONTRACT_VERSION).toMatch(/^[\w.:+-]{1,16}$/);
});
