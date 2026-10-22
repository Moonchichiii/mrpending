import react from '@vitejs/plugin-react';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

// VITE_SITE_MODE is fixed at build time so the static bundle can drop the form, the build client and /api entirely.
const siteMode = (mode: string) => {
  const value = loadEnv(mode, '.', 'VITE_').VITE_SITE_MODE ?? 'static';
  if (value !== 'static' && value !== 'local')
    throw new Error(`VITE_SITE_MODE must be static or local, not ${value}`);
  return value;
};

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  define: { 'import.meta.env.VITE_SITE_MODE': JSON.stringify(siteMode(mode)) },
  // The local installation runs the agent beside the dev server (apps/agent, PORT 4111).
  server: { proxy: { '/api': 'http://127.0.0.1:4111' } },
  // tokens.css is processed in tests so the contrast test reads the real file; other CSS stays stubbed.
  test: { environment: 'jsdom', include: ['src/**/*.test.{ts,tsx}'], css: { include: [/tokens\.css/] } },
}));
