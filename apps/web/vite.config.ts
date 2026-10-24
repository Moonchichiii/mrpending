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

// VITE_COMMIT is the full SHA the host built from (render.yaml passes RENDER_GIT_COMMIT); unset outside a deploy.
const commit = (mode: string) => {
  const value = loadEnv(mode, '.', 'VITE_').VITE_COMMIT ?? '';
  if (value !== '' && !/^[0-9a-f]{40}$/.test(value))
    throw new Error(`VITE_COMMIT must be a full commit SHA, not ${value}`);
  return value;
};

// The agent sees the proxy's loopback socket, so only a loopback browser may use it or a remote one is told "this machine".
export const loopbackClient = (address: string | undefined): boolean => {
  const bare = address?.replace(/^::ffff:/i, '');
  return bare === '::1' || (bare !== undefined && /^127(\.\d{1,3}){3}$/.test(bare));
};

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  define: {
    'import.meta.env.VITE_SITE_MODE': JSON.stringify(siteMode(mode)),
    'import.meta.env.VITE_COMMIT': JSON.stringify(commit(mode)),
  },
  // The local installation runs the agent beside the dev server (apps/agent, PORT 4111); bypass false answers 404.
  // changeOrigin sets Host to the agent's own 127.0.0.1:4111, which the agent requires; Origin stays the page's.
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:4111',
        changeOrigin: true,
        bypass: (req) => (loopbackClient(req.socket.remoteAddress) ? undefined : false),
      },
    },
  },
  // tokens.css is processed in tests so the contrast test reads the real file; other CSS stays stubbed.
  test: { environment: 'jsdom', include: ['src/**/*.test.{ts,tsx}'], css: { include: [/tokens\.css/] } },
}));
