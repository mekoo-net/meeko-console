import { describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';

import { routes } from '@/router/routes';

// 这一份只验「地址落到哪条路由上」。router.push 会顺带把那条路由的页面组件懒加载进来，而模型价格页连着
// 填价的表单、同步和导入的弹窗、半个组件库——机器忙的时候光加载它就超过默认的 5 秒，用例时过时不过。
// 页面本身有自己的用例（ratecardView.spec.ts），这里换成一个空壳。
vi.mock('@/features/platform/components/oneapi/views/RatecardView.vue', () => ({
  default: { name: 'RatecardViewStub', render: () => null },
}));
import {
  collectLeaves,
  filterTree,
  firstLeafIndex,
  matchView,
  navViews,
  type VisibilityFn,
} from '@/shared/ui/nav';

/**
 * 「组件设置」怎么挂进侧栏和路由：和系统设置并列的一组，进去按组件分，现在只有 OneApi → 模型价格。
 * 价格表原来在 Yomi 分组下面，旧地址要还能打开。
 */
describe('components settings: nav and routes', () => {
  const view = navViews.find((v) => v.id === 'components')!;
  const holding =
    (...perms: string[]): VisibilityFn =>
    (node) =>
      !node.perm || perms.includes(node.perm);

  it('is a view of its own next to system settings, one group per component', () => {
    const ids = navViews.map((v) => v.id);
    expect(ids.indexOf('components')).toBe(ids.indexOf('settings') + 1);
    expect(view.title).toBe('组件设置');
    expect(view.menu.map((n) => [n.type, n.title])).toEqual([['group', 'OneApi']]);
    expect(collectLeaves(view.menu).map((l) => [l.index, l.title])).toEqual([
      ['/components/oneapi/ratecard', '模型价格'],
    ]);
    // 没有空的占位页：每个入口都点得进去
    expect(collectLeaves(view.menu).some((l) => l.disabled)).toBe(false);
    expect(matchView('/components/oneapi/ratecard')?.id).toBe('components');
  });

  it('needs the platform settings permission to show up', () => {
    expect(view.perm).toBe('platform.settings.read');
    expect(firstLeafIndex(view, holding('platform.settings.read'))).toBe(
      '/components/oneapi/ratecard',
    );
    expect(filterTree(view.menu, holding())).toEqual([]);
  });

  it('every way in lands on the model ratecard page, old Yomi address included', async () => {
    for (const path of [
      '/components',
      '/components/oneapi',
      '/components/oneapi/ratecard',
      '/yomi/pricing',
    ]) {
      const router = createRouter({ history: createMemoryHistory(), routes });
      await router.push(path);
      const route = router.currentRoute.value;
      expect(route.name, path).toBe('components-oneapi-ratecard');
      expect(route.path, path).toBe('/components/oneapi/ratecard');
      expect(route.meta, path).toMatchObject({
        title: '模型价格',
        requiresAuth: true,
        permissions: ['platform.settings.read'],
      });
    }
  });

  it('the Yomi menu no longer carries a price table', () => {
    const yomi = navViews.find((v) => v.id === 'yomi')!;
    const leaves = collectLeaves(yomi.menu);
    expect(leaves.map((l) => l.index)).not.toContain('/yomi/pricing');
    // 重算有效价是 Yomi 自己的事，留在模型定价页
    expect(leaves.map((l) => l.index)).toContain('/yomi/rate');
  });
});
