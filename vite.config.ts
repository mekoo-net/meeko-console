import { fileURLToPath, URL } from 'node:url';

import { defineConfig, loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiBase = env.VITE_API_BASE ?? '/';

  return {
    plugins: [vue()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      port: 5173,
      proxy:
        apiBase && apiBase !== '/'
          ? {
              '/api': { target: apiBase, changeOrigin: true },
              '/accounts': { target: apiBase, changeOrigin: true },
              '/iam': { target: apiBase, changeOrigin: true },
              '/auth': { target: apiBase, changeOrigin: true },
              '/me': { target: apiBase, changeOrigin: true },
            }
          : undefined,
    },
    test: {
      environment: 'jsdom',
      globals: true,
      include: ['src/**/__tests__/**/*.spec.ts'],
      coverage: {
        provider: 'v8',
        reporter: ['text', 'html'],
      },
    },
  };
});
