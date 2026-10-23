import { defineConfig } from '@playwright/test';
import { env } from 'node:process';

// The smoke suite runs against a deployed static site only, never a dev server: the headers and routes are the host's.
const url = env['SMOKE_URL'];
if (url === undefined || !/^https?:\/\//.test(url)) throw new Error('SMOKE_URL must be the preview URL');

export default defineConfig({
  testDir: './smoke',
  forbidOnly: true,
  use: { browserName: 'chromium', baseURL: url },
});
