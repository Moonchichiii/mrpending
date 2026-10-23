import { defineConfig } from '@playwright/test';

// One dev server per site mode, so each page is tested in the bundle mode it ships in.
const STATIC = 'http://127.0.0.1:5181';
const LOCAL = 'http://127.0.0.1:5182';

export default defineConfig({
  testDir: './e2e',
  forbidOnly: true,
  use: { browserName: 'chromium' },
  projects: [
    { name: 'static', testMatch: /front-door\.spec\.ts/, use: { baseURL: STATIC } },
    { name: 'local', testMatch: /form\.spec\.ts|gallery\.spec\.ts|a11y\.spec\.ts/, use: { baseURL: LOCAL } },
  ],
  webServer: [
    {
      command: 'bunx vp dev --host 127.0.0.1 --port 5181 --strictPort',
      url: STATIC,
      env: { VITE_SITE_MODE: 'static' },
    },
    {
      command: 'bunx vp dev --host 127.0.0.1 --port 5182 --strictPort',
      url: LOCAL,
      env: { VITE_SITE_MODE: 'local' },
    },
  ],
});
