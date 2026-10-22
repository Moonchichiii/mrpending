import { expect, test } from 'vitest';
import { agentReady } from './index';

test('eval resolves the agent through the workspace', () => {
  expect(agentReady()).toBe(true);
});
