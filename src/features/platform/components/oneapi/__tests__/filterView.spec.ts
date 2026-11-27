import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import FilterRuleDialog from '../components/filter/FilterRuleDialog.vue';
import type { FilterRule } from '../model/filter.types';
import {
  _currentOneApiFilterDoc,
  _resetOneApiFilterMock,
  _someoneElseSavedFilter,
} from '../services/mock/oneapiFilterMock';
import FilterView from '../views/FilterView.vue';

/**
 * 过滤器页整页挂起来点一遍：按 Vendor 看规则表、默认动作和模式（观察 / 过滤）、开关规则、调顺序、删、新建和编辑、
 * 网关读不懂时怎么说、别人先改过时怎么办。数据用这一页自己的 mock；纯逻辑在 filterModel.spec.ts 里钉着。
 */

const granted = vi.hoisted(() => new Set<string>());

// 不管 .env 里配的是什么，这里都只用内存里的 mock
vi.mock('../services', async () => {
  const { OneApiFilterMock: Mock } = await import('../services/mock/oneapiFilterMock');
  const port = new Mock();
  return { getOneApiFilterPort: () => port };
});

vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({
    hasPermission: (...codes: string[]) => codes.some((c) => granted.has(c)),
  }),
}));

// 二次确认一律点「确认」
vi.mock('@/shared/composables/useConfirm', () => ({ confirmDanger: vi.fn(async () => true) }));

let wrapper: VueWrapper;

async function settle(): Promise<void> {
  await flushPromises();
  await flushPromises();
}

async function open(vendor?: string): Promise<void> {
  wrapper = mount(FilterView, { global: { plugins: [ElementPlus] }, attachTo: document.body });
  await settle();
  if (vendor) await choose(vendor);
}

async function choose(vendor: string): Promise<void> {
  await wrapper.find(`.vendor-item[data-vendor="${vendor}"]`).trigger('click');
  await settle();
}

const ruleIds = (): string[] => wrapper.findAll('.rule-row[data-rule]').map((r) => r.attributes('data-rule') ?? '');
const row = (id: string) => wrapper.find(`.rule-row[data-rule="${id}"]`);
const meta = (vendor: string): string => wrapper.find(`.vendor-item[data-vendor="${vendor}"] .vendor-item__meta`).text();
const saved = (vendor: string) => _currentOneApiFilterDoc()?.filters?.[vendor];
const savedIds = (vendor: string): string[] => (saved(vendor)?.rules ?? []).map((r) => r.id);
const toasts = (): string[] => [...document.body.querySelectorAll('.el-message')].map((m) => m.textContent?.trim() ?? '');
const dialog = () => wrapper.findComponent(FilterRuleDialog);

/** 弹窗交出一条规则（表单怎么拼规则由弹窗自己管，这里从它交出来的那一刻接着走）。 */
async function submitFromDialog(rule: FilterRule, originalId?: string): Promise<void> {
  dialog().vm.$emit('submit', rule, originalId);
  await settle();
}

/** 默认动作和模式是两个分段控件，按 data-test 认。 */
const segmented = (test: string) =>
  wrapper.findAllComponents({ name: 'ElSegmented' }).find((c) => c.attributes('data-test') === test)!;

async function setDefault(action: 'allow' | 'deny'): Promise<void> {
  segmented('channel-default').vm.$emit('change', action);
  await settle();
}

async function setMode(mode: 'observe' | 'enforce'): Promise<void> {
  segmented('channel-mode').vm.$emit('change', mode);
  await settle();
}

const when = (id: string): string | undefined => row(id).find('.chips').attributes('aria-label');

beforeEach(() => {
  _resetOneApiFilterMock();
  granted.clear();
  granted.add('platform.settings.write');
});

afterEach(() => {
  wrapper?.unmount();
  document.body.innerHTML = '';
});

describe('filter page', () => {
  it('lists every vendor with a one-line summary, and a vendor without a filter takes everything', async () => {
    await open();

    expect(wrapper.findAll('.vendor-item__name').map((n) => n.text())).toEqual(['Agentspace', 'Claude', 'Factory', 'Kiro']);
    expect(meta('factory')).toBe('1 条规则 · 默认放行 · 观察');
    expect(meta('claude')).toBe('3 条规则 · 默认拒绝 · 观察');
    expect(meta('kiro')).toBe('没有规则，什么都收');

    // 开场选中第一个
    expect(wrapper.find('.provider-detail__title').text()).toBe('Agentspace');
    expect(ruleIds()).toEqual([]);
    expect(wrapper.text()).toContain('这个 Vendor 还没有过滤器，所有请求都放行');
    expect(wrapper.find('[data-test="default-action"]').text()).toBe('放行');
  });

  it('shows a vendor rule table top to bottom, ending with the default action', async () => {
    await open('claude');

    expect(ruleIds()).toEqual(['own-client', 'tavern', 'old-cli']);
    expect(when('own-client')).toBe('分类器是 agent.claude');
    expect(when('tavern')).toBe('分类器是 chat.tavern 或 chat.app 或 chat.phone');
    expect(when('old-cli')).toBe('x-app 等于 "cli"');
    expect(row('own-client').find('.action-badge').text()).toBe('放行');
    // 关着的规则灰掉，但还在它的位置上
    expect(row('old-cli').classes()).toContain('rule-row--off');
    expect(wrapper.find('[data-test="default-action"]').text()).toBe('拒绝');
    expect(wrapper.find('[data-test="channel-state"]').text()).toContain('观察');
  });

  it('switching a rule off, moving it and deleting it each save at once', async () => {
    await open('claude');

    await row('tavern').find('.el-switch').trigger('click');
    await settle();
    expect(saved('claude')!.rules!.find((r) => r.id === 'tavern')!.enabled).toBe(false);

    await row('old-cli').find('[data-test="rule-up"]').trigger('click');
    await settle();
    expect(savedIds('claude')).toEqual(['own-client', 'old-cli', 'tavern']);
    expect(ruleIds()).toEqual(['own-client', 'old-cli', 'tavern']);

    await row('old-cli').find('[data-test="rule-delete"]').trigger('click');
    await settle();
    expect(savedIds('claude')).toEqual(['own-client', 'tavern']);
  });

  it('the first rule on a vendor creates its filter, mark-only and allowing by default', async () => {
    await open('kiro');
    await wrapper.find('[data-test="rule-create"]').trigger('click');
    expect(dialog().props('vendorName')).toBe('Kiro');

    await submitFromDialog({ id: 'no-chat', action: 'deny', when: { classifier: 'chat.app' } });

    // 新建的过滤器先是观察模式：一加上就开始拒请求的话，没人来得及看它会拦掉什么
    expect(saved('kiro')).toEqual({
      default: 'allow',
      enforce: false,
      rules: [{ id: 'no-chat', action: 'deny', when: { classifier: 'chat.app' } }],
    });
    expect(ruleIds()).toEqual(['no-chat']);
    expect(meta('kiro')).toBe('1 条规则 · 默认放行 · 观察');
    expect(toasts().join('|')).toContain('已新建');
    // 分类器没被碰
    expect(_currentOneApiFilterDoc()!.classifiers!.map((c) => c.id)).toEqual([
      'agent.claude',
      'chat.tavern',
      'chat.app',
      'chat.phone',
    ]);
  });

  it('editing keeps the rule where it is', async () => {
    await open('claude');
    await row('tavern').find('[data-test="rule-edit"]').trigger('click');
    expect(dialog().props('rule')).toMatchObject({ id: 'tavern' });

    await submitFromDialog({ id: 'tavern', action: 'allow', when: { classifier: 'chat.tavern' } }, 'tavern');

    expect(savedIds('claude')).toEqual(['own-client', 'tavern', 'old-cli']);
    expect(when('tavern')).toBe('分类器是 chat.tavern');
  });

  it('a rule the gateway cannot read is not saved, and the dialog is told why', async () => {
    await open('factory');
    await wrapper.find('[data-test="rule-create"]').trigger('click');

    await submitFromDialog({ id: 'no-nope', action: 'deny', when: { classifier: 'chat.nope' } });

    expect(savedIds('factory')).toEqual(['no-agents']);
    expect(dialog().props('problems')).toEqual(["Unknown classifier 'chat.nope'."]);
    expect(dialog().props('modelValue')).toBe(true);
  });

  it('turning enforcement on asks first; going back to mark-only and the default action save at once', async () => {
    await open('factory');
    const { confirmDanger } = await import('@/shared/composables/useConfirm');
    vi.mocked(confirmDanger).mockClear();

    await setMode('enforce');
    expect(confirmDanger).toHaveBeenCalledTimes(1);
    expect(saved('factory')!.enforce).toBe(true);
    expect(meta('factory')).toBe('1 条规则 · 默认放行 · 过滤');

    await setMode('observe');
    expect(confirmDanger).toHaveBeenCalledTimes(1);
    expect(saved('factory')!.enforce).toBe(false);

    await setDefault('deny');
    expect(saved('factory')!.default).toBe('deny');
    expect(wrapper.find('[data-test="default-action"]').text()).toBe('拒绝');
  });

  it('removing a filter puts the vendor back to taking everything', async () => {
    await open('factory');

    await wrapper.find('[data-test="channel-remove"]').trigger('click');
    await settle();

    expect(saved('factory')).toBeUndefined();
    expect(meta('factory')).toBe('没有规则，什么都收');
  });

  it('a filter written by hand without "enforce" is shown as observing, which is what the gateway does', async () => {
    _resetOneApiFilterMock({
      filters: { kiro: { rules: [{ id: 'x', action: 'deny', when: { field: 'header.origin', op: 'exists' } }] }, retired: {} },
    });
    await open('kiro');

    expect(meta('kiro')).toBe('1 条规则 · 默认放行 · 观察');
    // 号池后台不认识的 Vendor 也列出来，不然它的过滤器没处看、没处删
    expect(wrapper.find('.vendor-item[data-vendor="retired"]').text()).toContain('未登记');
  });

  it('a document the gateway cannot fully read says where, and which vendor is not filtered', async () => {
    _resetOneApiFilterMock({
      classifiers: [{ id: 'chat.app', when: { field: 'header.user-agent', op: 'exists' } }],
      filters: { kiro: { rules: [{ id: 'x', action: 'deny', when: { classifier: 'chat.gone' } }] } },
    });
    await open();

    expect(wrapper.find('[data-test="doc-problems"]').text()).toContain("filter 'kiro' rule 'x'");
    expect(wrapper.find('.vendor-item[data-vendor="kiro"]').text()).toContain('不生效');
    expect(wrapper.find('.vendor-item[data-vendor="factory"]').text()).not.toContain('不生效');

    await choose('kiro');
    expect(row('x').text()).toContain('读不懂');
    expect(wrapper.text()).toContain("网关读不懂这个过滤器，整个不生效：Unknown classifier 'chat.gone'.");
  });

  it('when someone else saved first, this change is dropped and the latest is shown', async () => {
    await open('claude');
    _someoneElseSavedFilter();

    await row('tavern').find('.el-switch').trigger('click');
    await settle();

    // 没有悄悄盖掉别人的：库里那条还开着
    expect(saved('claude')!.rules!.find((r) => r.id === 'tavern')!.enabled).toBeUndefined();
    expect(toasts().join('|')).toContain('别人刚改过');
    // 重新读过以后还停在同一个 Vendor 上
    expect(wrapper.find('.provider-detail__title').text()).toBe('Claude');

    // 手上是新版本号了，再改就存得进去
    await row('tavern').find('.el-switch').trigger('click');
    await settle();
    expect(saved('claude')!.rules!.find((r) => r.id === 'tavern')!.enabled).toBe(false);
  });

  it('without the write permission the page only shows', async () => {
    granted.clear();
    await open('claude');

    expect(ruleIds()).toHaveLength(3);
    expect(wrapper.find('[data-test="rule-create"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="rule-edit"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="channel-remove"]').exists()).toBe(false);
    expect(row('tavern').find('.el-switch').classes()).toContain('is-disabled');
    expect(segmented('channel-mode').props('disabled')).toBe(true);
    expect(segmented('channel-default').props('disabled')).toBe(true);
  });

  it('with no document yet, the first rule creates it', async () => {
    _resetOneApiFilterMock(null);
    await open('factory');
    expect(meta('factory')).toBe('没有规则，什么都收');

    await wrapper.find('[data-test="rule-create"]').trigger('click');
    await submitFromDialog({ id: 'no-origin', action: 'deny', when: { not: { field: 'header.origin', op: 'exists' } } });

    expect(savedIds('factory')).toEqual(['no-origin']);
  });
});
