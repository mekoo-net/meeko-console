import { fileURLToPath, URL } from 'node:url';

import { defineConfig, loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  /** 显式设置了 VITE_API_BASE（含 `/`）即视为已配置，关闭 dev proxy。 */
  const hasApiBase = env.VITE_API_BASE !== undefined && env.VITE_API_BASE !== '';
  const apiBase = hasApiBase ? env.VITE_API_BASE.replace(/\/$/, '') : '';
  /** 未设 VITE_API_BASE 时走相对路径，需 dev proxy 转发到 Gateway。 */
  const gatewayTarget = apiBase || 'http://localhost:7000';

  /** 与 Vue 路由同名的 API 前缀：浏览器整页刷新时不要代理到后端。 */
  function spaBypass(req: { headers: { accept?: string } }): string | undefined {
    if (req.headers.accept?.includes('text/html')) return '/index.html';
    return undefined;
  }

  // 与 Gateway 路由前缀（Discovery:Gateway:Routes）对齐：
  //   /api/**     → BFF + Keystone /api/user
  //   /auth/**    → Keystone（匿名登录/注册/刷新）
  //   /staff/**   → Keystone（staff 登录）
  //   /me/**      → Keystone（当前用户自助）
  //   /demuxai/** → DemuxAi 产品门面
  //   /tavern/**  → Tavern 产品门面
  // 旧的 /accounts、/iam 已并入 /api/admin/**，不再需要独立 proxy 条目。
  const proxyRules = {
    '/api':     { target: gatewayTarget, changeOrigin: true },
    '/auth':    { target: gatewayTarget, changeOrigin: true },
    '/staff':   { target: gatewayTarget, changeOrigin: true },
    '/me':      { target: gatewayTarget, changeOrigin: true, bypass: spaBypass },
    '/demuxai': { target: gatewayTarget, changeOrigin: true, bypass: spaBypass },
    '/tavern': { target: gatewayTarget, changeOrigin: true, bypass: spaBypass },
  };

  return {
    plugins: [vue()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
        // 平台公共契约（@demux/common）以嵌套子模块源码（src/common）就地消费。
        '@demux/common': fileURLToPath(new URL('./src/common/src/index.ts', import.meta.url)),
      },
    },
    server: {
      port: 5173,
      // 已设 VITE_API_BASE 时前端直连 Gateway，勿再代理（否则会与 SPA 路由冲突）。
      proxy: hasApiBase ? undefined : proxyRules,
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
