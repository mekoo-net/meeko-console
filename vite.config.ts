import { fileURLToPath, URL } from 'node:url';

import { defineConfig, loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiBase = (env.VITE_API_BASE ?? '').replace(/\/$/, '');
  /** 未设 VITE_API_BASE 时走相对路径，需 dev proxy 转发到 Gateway。 */
  const gatewayTarget = apiBase || 'http://localhost:7000';

  /** 与 Vue 路由同名的 API 前缀：浏览器整页刷新时不要代理到后端。 */
  function spaBypass(req: { headers: { accept?: string } }): string | undefined {
    if (req.headers.accept?.includes('text/html')) return '/index.html';
    return undefined;
  }

  const proxyRules = {
    '/api': { target: gatewayTarget, changeOrigin: true },
    '/accounts': { target: gatewayTarget, changeOrigin: true, bypass: spaBypass },
    '/iam': { target: gatewayTarget, changeOrigin: true },
    '/auth': { target: gatewayTarget, changeOrigin: true },
    '/staff': { target: gatewayTarget, changeOrigin: true },
    '/me': { target: gatewayTarget, changeOrigin: true },
    '/demuxai': { target: gatewayTarget, changeOrigin: true },
  };

  return {
    plugins: [vue()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      port: 5173,
      // 已设 VITE_API_BASE 时前端直连 Gateway，勿再代理（否则 /accounts 会与 SPA 路由冲突）
      proxy: apiBase ? undefined : proxyRules,
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
