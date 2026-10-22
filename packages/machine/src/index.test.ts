import { expect, test } from 'vitest';
import { VERSIONS } from './index';

test('machine resolves the contract through the workspace', () => {
  expect(VERSIONS).toEqual({ contract: 'c1', rules: 'r2' });
});
