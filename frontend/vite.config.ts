import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  const parsedPort = Number(env.FRONTEND_PORT || 5173);
  const devPort = Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : 5173;
  const apiProxyTarget = (env.API_PROXY_TARGET || 'http://127.0.0.1:8000').trim();

  return {
    plugins: [react()],
    resolve: {
      dedupe: ['react', 'react-dom'],
    },
    server: {
      port: devPort,
      proxy: {
        '/api': {
          target: apiProxyTarget,
          changeOrigin: true,
        },
      },
    },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/test/setup.ts'],
      testTimeout: 45_000,
    },
  };
});
