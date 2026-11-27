import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 模型定价页整页挂起来看：别名按模型家族归组、分组标题上写着这一组怎么定价，分组可以折起来。
 * 出价的规矩在 pricingContract.spec.ts 里钉着，这里只看页面把它摆对了没有。
 */

/**
 * 不管 .env 里配的是什么，这里都只用内存里的 mock：页面的测试绝不能把请求打到真的平台上去。
 * 每条用例把模块表清掉重新登记，页面和 mock 都重新载入，拿到的是一份新的种子数据。
 */
function useFreshMock(): void {
  vi.resetModules();
  vi.doMock('../services', async () => {
    const { YomiCatalogMock } = await import('../services/mock/yomiCatalogMock');
    const { YomiRateMock } = await import('../services/mock/yomiRateMock');
    const { YomiPricingMock } = await import('../services/mock/yomiPricingMock');
    const { YomiVendorRouteMock } = await import('../services/mock/yomiVendorRouteMock');
    const catalog = new YomiCatalogMock();
    const rate = new YomiRateMock();
    const pricing = new YomiPricingMock();
    const routes = new YomiVendorRouteMock();
    return {
      getYomiCatalogPort: () => catalog,
      getYomiRatePort: () => rate,
      getYomiPricingPort: () => pricing,
      getYomiVendorRoutePort: () => routes,
    };
  });
}

let wrapper: VueWrapper;

/** mock 的每个接口都要等一拍，页面又是先取渠道、再取这个渠道的分组和别名：等够了再看。 */
async function settle(ms = 900): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
  await flushPromises();
  await flushPromises();
}

async function open(): Promise<void> {
  const mod = await import('../views/RateView.vue');
  wrapper = mount(mod.default, { global: { plugins: [ElementPlus] }, attachTo: document.body });
  await settle();
}

/** jsdom 不排版，相邻两块字之间有没有空白看的是模板怎么换行：比的时候把空白全去掉。 */
const clean = (s: string): string => s.replace(/\s+/g, '');

const familyHeaders = (): string[] => wrapper.findAll('.fam-row').map((r) => clean(r.text()));

const aliases = (): string[] => wrapper.findAll('article.rate-row .alias-map__name').map((n) => n.text());

async function toggle(family: string): Promise<void> {
  await wrapper
    .findAll('.fam-row__id')
    .find((b) => b.find('.fam-row__name').text() === family)!
    .trigger('click');
  await flushPromises();
}

function expanded(family: string): string | undefined {
  return wrapper
    .findAll('.fam-row__id')
    .find((b) => b.find('.fam-row__name').text() === family)!
    .attributes('aria-expanded');
}

describe('model pricing page', () => {
  beforeEach(() => {
    localStorage.clear();
    useFreshMock();
  });

  afterEach(() => {
    wrapper?.unmount();
    document.body.innerHTML = '';
    vi.doUnmock('../services');
  });

  it('lists a two-maker vendor as one group per model family, each showing its own multiplier', async () => {
    await open();

    // 种子里排第一的渠道是 antigravity：claude 和 gemini 各成一组。
    expect(wrapper.find('.provider-detail__sub').text()).toBe('antigravity');
    // Gemini 组谁都没改过：就是倍率 ×1，和别的价一样显示，不另外标「未设置」。
    expect(familyHeaders()).toEqual(['Claude2个别名倍率×1.3', 'Gemini1个别名倍率×1']);
    expect(aliases()).toEqual(['ag-claude-opus', 'ag-claude-sonnet', 'ag-gemini-pro']);
    // 没有「全量重算」按钮：改哪一组、哪一条，后端就重算哪一组、哪一条。
    expect(clean(wrapper.text())).not.toContain('重算');
    // 渠道不管价格：渠道标题上没有定价，也没有改渠道定价的入口。
    expect(wrapper.find('.mult').exists()).toBe(false);
    expect(clean(wrapper.find('.provider-detail__header').text())).not.toContain('倍率');
  });

  it('a family group folds away and back, leaving its header and multiplier in place', async () => {
    await open();
    expect(expanded('Claude')).toBe('true');

    await toggle('Claude');
    // 折起来的只是这一组的别名：标题、倍率还在，别的组不受影响。
    expect(expanded('Claude')).toBe('false');
    expect(aliases()).toEqual(['ag-gemini-pro']);
    expect(familyHeaders()[0]).toBe('Claude2个别名倍率×1.3');
    expect(expanded('Gemini')).toBe('true');

    await toggle('Claude');
    expect(expanded('Claude')).toBe('true');
    expect(aliases()).toEqual(['ag-claude-opus', 'ag-claude-sonnet', 'ag-gemini-pro']);
  });

  it('remembers what was folded across a reload, per vendor', async () => {
    await open();
    await toggle('Gemini');
    expect(aliases()).toEqual(['ag-claude-opus', 'ag-claude-sonnet']);
    wrapper.unmount();

    // 刷新：页面和数据都重新载入，折过的那一组还折着。
    useFreshMock();
    await open();
    expect(expanded('Gemini')).toBe('false');
    expect(expanded('Claude')).toBe('true');
    expect(aliases()).toEqual(['ag-claude-opus', 'ag-claude-sonnet']);

    // 记的是「渠道 + 家族」：别的渠道里的 Gemini 组不跟着折。
    await wrapper
      .findAll('.provider-sidebar__item')
      .find((c) => c.text().includes('gemini'))!
      .trigger('click');
    await settle();
    expect(wrapper.find('.provider-detail__sub').text()).toBe('gemini');
    expect(expanded('Gemini')).toBe('true');
    expect(aliases().length).toBeGreaterThan(0);
  });

  it('a group priced per call shows that price on its header and on the aliases that inherit it', async () => {
    await open();
    // 直接在数据里把 Claude 组改成按次，再让页面重新取一遍（切走再切回来）。
    const { getYomiPricingPort, getYomiCatalogPort } = await import('../services');
    const groups = await getYomiCatalogPort().listProviderGroups();
    const ag = groups.success ? groups.data.find((g) => g.queueGroup === 'antigravity')! : null;
    await getYomiPricingPort().setFamilyPricing({ vendorId: ag!.id, family: 'anthropic', mode: 'per_call', value: 0.35 });

    const pick = async (queueGroup: string): Promise<void> => {
      await wrapper
        .findAll('.provider-sidebar__item')
        .find((c) => c.text().includes(queueGroup))!
        .trigger('click');
      await settle();
    };
    await pick('codex');
    await pick('antigravity');

    expect(familyHeaders()[0]).toBe('Claude2个别名按次¥0.35');
    const claudeRows = wrapper.findAll('article.rate-row').slice(0, 2).map((r) => clean(r.text()));
    for (const row of claudeRows) {
      expect(row).toContain('¥0.35');
      expect(row).toContain('继承分组');
    }
  });

  it('every priced alias has a web-chat switch that is on by default and turns off in place', async () => {
    await open();
    const switches = () => wrapper.findAll('article.rate-row .rate-row__chat .el-switch');
    // 定了价的都下发：三条别名的开关默认都开着。
    expect(switches()).toHaveLength(3);
    expect(switches().every((s) => s.classes().includes('is-checked'))).toBe(true);

    // 关掉 ag-claude-sonnet：只动这一个开关，数据里那条别名跟着关，别的不动。
    const sonnetRow = wrapper
      .findAll('article.rate-row')
      .find((r) => r.find('.alias-map__name').text() === 'ag-claude-sonnet')!;
    await sonnetRow.find('.el-switch').trigger('click');
    await settle();

    const { getYomiStore } = await import('../services/mock/data');
    const store = getYomiStore();
    expect(store.vendorRoutes.find((r) => r.routeKey === 'ag-claude-sonnet')!.chatVisible).toBe(false);
    expect(store.vendorRoutes.find((r) => r.routeKey === 'ag-claude-opus')!.chatVisible).toBe(true);
    expect(sonnetRow.find('.el-switch').classes()).not.toContain('is-checked');
    // 点的是开关，不是这一行：定价抽屉没打开。
    expect(document.body.querySelector('.route-rate-body')).toBeNull();
  });

  it('a folded state that cannot be read back is treated as nothing folded', async () => {
    localStorage.setItem('meeko.yomi.rate.collapsedFamilies', '{not json');
    await open();
    expect(expanded('Claude')).toBe('true');
    expect(aliases()).toEqual(['ag-claude-opus', 'ag-claude-sonnet', 'ag-gemini-pro']);
  });
});
