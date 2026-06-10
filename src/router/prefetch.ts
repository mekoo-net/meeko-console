import type { Router } from 'vue-router';

/** 预拉取目标路由的 lazy chunk，悬停菜单时调用。 */
export function prefetchRoute(router: Router, path: string): void {
  if (path === router.currentRoute.value.path) return;

  const resolved = router.resolve(path);
  for (const record of resolved.matched) {
    const loader = record.components?.default;
    if (typeof loader === 'function') {
      void (loader as () => Promise<unknown>)();
    }
  }
}
