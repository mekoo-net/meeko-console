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

  // 与平台网关的路由前缀对齐（各服务在代码里声明，见 Meeko.Platform 的 XxxGatewayRoutes）。
  // 平台的地址不带 /api：域名已经是 api.meeko.top。接口的第一段和页面路由可能同名（/billing、/admin），
  // 所以整页刷新（Accept: text/html）不代理，交给前端路由。
  //   /admin/**、/views/**         → 后台接口和 Bff 的只读视图
  //   /billing/**、/storage/**、/notifications/**、/user/**、/status → 各领域服务
  //   /auth/**    → Keystone（匿名登录/注册/刷新）
  //   /staff/**   → Keystone（staff 登录）
  //   /me/**      → Keystone（当前用户自助）
  //   /yomi/**  → Yomi 产品门面（前端页面路由仍是 /yomi/*，不经代理）
  //   /tavern/**  → Tavern 产品门面
  //   /toapi/**   → ToApi 产品门面（Meeko.ToApi 控制面）
  const proxyRules = {
    '/admin':         { target: gatewayTarget, changeOrigin: true, bypass: spaBypass },
    '/views':         { target: gatewayTarget, changeOrigin: true, bypass: spaBypass },
    '/billing':       { target: gatewayTarget, changeOrigin: true, bypass: spaBypass },
    '/storage':       { target: gatewayTarget, changeOrigin: true, bypass: spaBypass },
    '/notifications': { target: gatewayTarget, changeOrigin: true, bypass: spaBypass },
    '/user':          { target: gatewayTarget, changeOrigin: true, bypass: spaBypass },
    '/status':        { target: gatewayTarget, changeOrigin: true, bypass: spaBypass },
    '/auth':    { target: gatewayTarget, changeOrigin: true },
    '/staff':   { target: gatewayTarget, changeOrigin: true },
    '/me':      { target: gatewayTarget, changeOrigin: true, bypass: spaBypass },
    '/yomi':   { target: gatewayTarget, changeOrigin: true, bypass: spaBypass },
    '/tavern': { target: gatewayTarget, changeOrigin: true, bypass: spaBypass },
    '/toapi':  { target: gatewayTarget, changeOrigin: true, bypass: spaBypass },
  };

  return {
    plugins: [vue()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
        // 平台公共契约（@yomi/common）以嵌套子模块源码（src/common）就地消费。
        '@yomi/common': fileURLToPath(new URL('./src/common/src/index.ts', import.meta.url)),
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
