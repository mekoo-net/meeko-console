import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import ClassifierRuleDialog from '../components/classifier/ClassifierRuleDialog.vue';
import type { ClassifierRule } from '../model/classifier.types';
import {
  _currentOneApiClassifierDoc,
  _resetOneApiClassifierMock,
  _someoneElseSavedClassifier,
} from '../services/mock/oneapiClassifierMock';
import ClassifierView from '../views/ClassifierView.vue';

/**
 * 请求分类页整页挂起来点一遍：按 Vendor 看规则、开关、调顺序、删、新建和编辑、别人先改过时怎么办。
 * 数据用这一页自己的 mock；规则的纯逻辑在 classifierModel.spec.ts 里钉着，这里只看页面把它用对了没有。
 */

const granted = vi.hoisted(() => new Set<string>());

// 不管 .env 里配的是什么，这里都只用内存里的 mock
vi.mock('../services', async () => {
  const { OneApiClassifierMock: Mock } = await import('../services/mock/oneapiClassifierMock');
  const port = new Mock();
  return { getOneApiClassifierPort: () => port };
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

async function open(): Promise<void> {
  wrapper = mount(ClassifierView, {
    global: { plugins: [ElementPlus] },
    attachTo: document.body,
  });
  await settle();
}

const ruleIds = (): string[] => wrapper.findAll('.rule-row').map((r) => r.attributes('data-rule') ?? '');
const row = (id: string) => wrapper.find(`.rule-row[data-rule="${id}"]`);
const scopeNames = (): string[] => wrapper.findAll('.scope-item__name').map((n) => n.text().replace(/\s+/g, ' '));
const savedIds = (): string[] => (_currentOneApiClassifierDoc()?.rules ?? []).map((r) => r.id);
const toasts = (): string[] =>
  [...document.body.querySelectorAll('.el-message')].map((m) => m.textContent?.trim() ?? '');

async function chooseScope(name: string): Promise<void> {
  const item = wrapper.findAll('.scope-item').find((b) => b.find('.scope-item__name').text().startsWith(name));
  await item!.trigger('click');
  await settle();
}

/** 弹窗交出一条规则（表单本身怎么拼规则由弹窗自己的逻辑管，这里从它交出来的那一刻接着走）。 */
async function submitFromDialog(rule: ClassifierRule, originalId?: string): Promise<void> {
  wrapper.findComponent(ClassifierRuleDialog).vm.$emit('submit', rule, originalId);
  await settle();
}

beforeEach(() => {
  _resetOneApiClassifierMock();
  granted.clear();
  granted.add('platform.settings.write');
});

afterEach(() => {
  wrapper?.unmount();
  document.body.innerHTML = '';
});

describe('classifier page', () => {
  it('lists every rule in the order the gateway evaluates them', async () => {
    await open();

    expect(ruleIds()).toEqual(['ua-claude-code', 'ua-tauritavern', 'ua-chat-apps', 'claude-own-agent', 'no-ua']);
    expect(row('ua-claude-code').find('.rule-row__label').text()).toBe('agent.claude_code');
    expect(row('ua-claude-code').find('.rule-row__when').text()).toBe('请求头 user-agent 开头是 "claude-cli/"');
    expect(row('ua-claude-code').find('.rule-row__vendor').text()).toBe('factory');
    expect(row('ua-tauritavern').find('.rule-row__common').exists()).toBe(true);
    // 关着的规则灰掉，但还在它的位置上
    expect(row('no-ua').classes()).toContain('rule-row--off');
  });

  it('a vendor shows the rules its requests go through: its own plus the common ones', async () => {
    await open();
    expect(scopeNames()).toEqual(['全部规则', 'Agentspace', 'Claude', 'Factory', 'Kiro']);

    await chooseScope('Factory');
    expect(ruleIds()).toEqual(['ua-claude-code', 'ua-tauritavern', 'ua-chat-apps', 'no-ua']);
    // 顺序那一格是它在整份文档里的位置，筛过以后不重新编号
    expect(wrapper.findAll('.rule-row td.rule-table__order').map((c) => c.text())).toEqual(['1', '2', '3', '5']);

    await chooseScope('Claude');
    expect(ruleIds()).toEqual(['ua-tauritavern', 'ua-chat-apps', 'claude-own-agent', 'no-ua']);

    await chooseScope('Kiro');
    expect(ruleIds()).toEqual(['ua-tauritavern', 'ua-chat-apps', 'no-ua']);
  });

  it('switching a rule off is saved at once', async () => {
    await open();

    await row('ua-tauritavern').find('.el-switch').trigger('click');
    await settle();

    expect(_currentOneApiClassifierDoc()!.rules!.find((r) => r.id === 'ua-tauritavern')!.enabled).toBe(false);
    expect(row('ua-tauritavern').classes()).toContain('rule-row--off');
  });

  it('moving a rule swaps it with its neighbour in the list on screen', async () => {
    await open();
    await chooseScope('Factory');

    // Factory 上看到的是 ua-claude-code、ua-tauritavern、ua-chat-apps、no-ua；把第一条下移
    await row('ua-claude-code').find('[data-test="rule-down"]').trigger('click');
    await settle();

    expect(savedIds()).toEqual(['ua-tauritavern', 'ua-claude-code', 'ua-chat-apps', 'claude-own-agent', 'no-ua']);
    expect(ruleIds()).toEqual(['ua-tauritavern', 'ua-claude-code', 'ua-chat-apps', 'no-ua']);
  });

  it('deleting asks first, then saves', async () => {
    await open();

    await row('ua-chat-apps').find('[data-test="rule-delete"]').trigger('click');
    await settle();

    expect(savedIds()).not.toContain('ua-chat-apps');
    expect(ruleIds()).not.toContain('ua-chat-apps');
  });

  it('a new rule from the dialog is checked, saved, and shows up last', async () => {
    await open();
    await wrapper.find('[data-test="rule-create"]').trigger('click');

    await submitFromDialog({
      id: 'codex',
      label: 'agent.codex',
      vendors: ['factory'],
      when: { field: 'header.originator', op: 'eq', value: 'codex_cli_rs' },
    });

    expect(savedIds().at(-1)).toBe('codex');
    expect(ruleIds().at(-1)).toBe('codex');
    expect(toasts().join('|')).toContain('已新建');
  });

  it('creating under a vendor starts with that vendor ticked', async () => {
    await open();
    await chooseScope('Claude');
    await wrapper.find('[data-test="rule-create"]').trigger('click');

    expect(wrapper.findComponent(ClassifierRuleDialog).props('defaultVendors')).toEqual(['claude']);
  });

  it('editing keeps the rule where it is', async () => {
    await open();
    await row('ua-tauritavern').find('[data-test="rule-edit"]').trigger('click');
    expect(wrapper.findComponent(ClassifierRuleDialog).props('rule')).toMatchObject({ id: 'ua-tauritavern' });

    await submitFromDialog(
      { id: 'ua-tauritavern', label: 'tavern.tauri', when: { field: 'header.user-agent', op: 'prefix', value: 'TauriTavern/' } },
      'ua-tauritavern',
    );

    expect(savedIds()).toEqual(['ua-claude-code', 'ua-tauritavern', 'ua-chat-apps', 'claude-own-agent', 'no-ua']);
    expect(row('ua-tauritavern').find('.rule-row__label').text()).toBe('tavern.tauri');
  });

  it('a rule the gateway cannot read is not saved, and the dialog is told why', async () => {
    await open();
    await wrapper.find('[data-test="rule-create"]').trigger('click');

    await submitFromDialog({
      id: 'body-rule',
      label: 'agent.by_prompt',
      when: { field: 'system.head', op: 'contains', value: 'You are Claude Code' },
    });

    expect(savedIds()).not.toContain('body-rule');
    expect(wrapper.findComponent(ClassifierRuleDialog).props('problems')).toEqual(["Unknown field 'system.head'."]);
    expect(wrapper.findComponent(ClassifierRuleDialog).props('modelValue')).toBe(true);
  });

  it('when someone else saved first, this change is dropped and the latest is shown', async () => {
    await open();
    _someoneElseSavedClassifier();

    await row('ua-tauritavern').find('.el-switch').trigger('click');
    await settle();

    // 没有悄悄盖掉别人的：库里那条还开着
    expect(_currentOneApiClassifierDoc()!.rules!.find((r) => r.id === 'ua-tauritavern')!.enabled).toBeUndefined();
    expect(toasts().join('|')).toContain('别人刚改过');

    // 重新读过以后手上是新版本号，再改就存得进去
    await row('ua-tauritavern').find('.el-switch').trigger('click');
    await settle();
    expect(_currentOneApiClassifierDoc()!.rules!.find((r) => r.id === 'ua-tauritavern')!.enabled).toBe(false);
  });

  it('keeps the parts of the document this page does not edit', async () => {
    _resetOneApiClassifierMock({
      rules: [{ id: 'r', label: 'tavern.x', when: { field: 'model', op: 'exists' } }],
      channels: { factory: { enforce: false, rules: [{ match: 'agent.*', action: 'deny' }] } },
    });
    await open();
    // 提一句：这份文档里还有这一页不管的设置
    expect(wrapper.find('.page-note').exists()).toBe(true);

    await row('r').find('.el-switch').trigger('click');
    await settle();

    expect(_currentOneApiClassifierDoc()!.channels).toEqual({
      factory: { enforce: false, rules: [{ match: 'agent.*', action: 'deny' }] },
    });
  });

  it('without the write permission the page only shows', async () => {
    granted.clear();
    await open();

    expect(ruleIds()).toHaveLength(5);
    expect(wrapper.find('[data-test="rule-create"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="rule-edit"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="rule-delete"]').exists()).toBe(false);
    expect(row('ua-tauritavern').find('.el-switch').classes()).toContain('is-disabled');
  });

  it('with no document yet, the first rule creates it', async () => {
    _resetOneApiClassifierMock(null);
    await open();
    expect(ruleIds()).toEqual([]);
    expect(wrapper.text()).toContain('还没有分类规则');

    await submitFromDialog({ id: 'first', label: 'tavern.sillytavern', when: { field: 'model', op: 'exists' } });

    expect(savedIds()).toEqual(['first']);
    expect(ruleIds()).toEqual(['first']);
  });
});
