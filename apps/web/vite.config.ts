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

// The agent sees the proxy's loopback socket, so only a loopback browser may use it or a remote one is told "this machine".
export const loopbackClient = (address: string | undefined): boolean => {
  const bare = address?.replace(/^::ffff:/i, '');
  return bare === '::1' || (bare !== undefined && /^127(\.\d{1,3}){3}$/.test(bare));
};

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  define: { 'import.meta.env.VITE_SITE_MODE': JSON.stringify(siteMode(mode)) },
  // The local installation runs the agent beside the dev server (apps/agent, PORT 4111); bypass false answers 404.
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:4111',
        bypass: (req) => (loopbackClient(req.socket.remoteAddress) ? undefined : false),
      },
    },
  },
  // tokens.css is processed in tests so the contrast test reads the real file; other CSS stays stubbed.
  test: { environment: 'jsdom', include: ['src/**/*.test.{ts,tsx}'], css: { include: [/tokens\.css/] } },
}));
