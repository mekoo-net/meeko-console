import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import ClassifierDialog from '../components/filter/ClassifierDialog.vue';
import ConditionEditor from '../components/filter/ConditionEditor.vue';
import { MOCK_FILTER_SCHEMA, _currentOneApiFilterDoc, _resetOneApiFilterMock } from '../services/mock/oneapiFilterMock';
import type { FilterClassifier } from '../model/filter.types';
import ClassifierView from '../views/ClassifierView.vue';

/**
 * 分类器页整页挂起来点一遍：按顺序列出、谁在引用、调顺序、新建和编辑、被引用的不让删、网关读不懂时怎么说。
 * 后半是两个弹窗共用的条件编辑器：表单读得成的条件交回去不变，读不成的走 JSON。
 */

const granted = vi.hoisted(() => new Set<string>());

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

vi.mock('@/shared/composables/useConfirm', () => ({ confirmDanger: vi.fn(async () => true) }));

let wrapper: VueWrapper;

async function settle(): Promise<void> {
  await flushPromises();
  await flushPromises();
}

async function open(): Promise<void> {
  wrapper = mount(ClassifierView, { global: { plugins: [ElementPlus] }, attachTo: document.body });
  await settle();
}

const ids = (): string[] => wrapper.findAll('.cls-card').map((r) => r.attributes('data-classifier') ?? '');
const row = (id: string) => wrapper.find(`.cls-card[data-classifier="${id}"]`);
const savedIds = (): string[] => (_currentOneApiFilterDoc()?.classifiers ?? []).map((c) => c.id);
const toasts = (): string[] => [...document.body.querySelectorAll('.el-message')].map((m) => m.textContent?.trim() ?? '');
const dialog = () => wrapper.findComponent(ClassifierDialog);

async function submitFromDialog(c: FilterClassifier, originalId?: string): Promise<void> {
  dialog().vm.$emit('submit', c, originalId);
  await settle();
}

beforeEach(() => {
  _resetOneApiFilterMock();
  granted.clear();
  granted.add('platform.settings.write');
});

afterEach(() => {
  wrapper?.unmount();
  document.body.innerHTML = '';
});

describe('classifier page', () => {
  it('lists the classifiers in order, with who refers to them', async () => {
    await open();

    expect(ids()).toEqual(['agent.claude', 'chat.tavern', 'chat.app', 'chat.webview']);
    expect(row('agent.claude').find('.cls-card__name').text()).toBe('Claude');
    expect(row('agent.claude').find('.cls-card__id').text()).toBe('agent.claude');
    expect(row('agent.claude').find('.chips').attributes('aria-label')).toBe(
      'user-agent 开头是 "claude-cli/" 或 （提示词·系统 包含 "You are Claude Code" 且 工具·名称 全部包含 "Bash" 和 "Read" 和 "Edit"）',
    );
    expect(row('agent.claude').findAll('.cls-card__use').map((t) => t.text())).toEqual([
      'Factory · no-agents',
      'Claude · own-client',
    ]);
    expect(row('chat.webview').findAll('.cls-card__use').map((t) => t.text())).toEqual(['Claude · tavern']);
  });

  it('a classifier no filter refers to can be moved and deleted', async () => {
    _resetOneApiFilterMock({
      classifiers: [
        { id: 'a.one', when: { field: 'header.origin', op: 'exists' } },
        { id: 'b.two', when: { field: 'header.referer', op: 'exists' } },
      ],
    });
    await open();
    expect(row('a.one').find('.cls-card__unused').text()).toBe('没有过滤器引用');

    await row('b.two').find('[data-test="classifier-up"]').trigger('click');
    await settle();
    expect(savedIds()).toEqual(['b.two', 'a.one']);

    await row('a.one').find('[data-test="classifier-delete"]').trigger('click');
    await settle();
    expect(savedIds()).toEqual(['b.two']);
  });

  it('filters by category; the order column keeps the place in the whole list and reordering waits', async () => {
    await open();
    expect(wrapper.findAll('.cat-chip').map((c) => c.text().replace(/\s+/g, ' '))).toEqual([
      '全部 4',
      'Agent 1',
      '聊天 3',
    ]);

    await wrapper.find('[data-category="chat"]').trigger('click');
    expect(ids()).toEqual(['chat.tavern', 'chat.app', 'chat.webview']);
    expect(row('chat.tavern').find('.cls-card__order').text()).toBe('2');
    // 顺序是整份的：筛着的时候上移会跨过看不见的那些
    expect(row('chat.app').find('[data-test="classifier-up"]').attributes('disabled')).toBeDefined();

    await wrapper.find('[data-test="category-all"]').trigger('click');
    expect(ids()).toHaveLength(4);
  });

  it('a classifier a filter still refers to cannot be deleted, and says which rules to change first', async () => {
    await open();

    await row('chat.app').find('[data-test="classifier-delete"]').trigger('click');
    await settle();

    expect(savedIds()).toContain('chat.app');
    expect(toasts().join('|')).toContain('Claude 的「tavern」');
  });

  it('a new classifier is checked, saved, and shows up last', async () => {
    await open();
    await wrapper.find('[data-test="classifier-create"]').trigger('click');

    await submitFromDialog({ id: 'agent.codex', when: { field: 'header.originator', op: 'eq', value: 'codex_cli_rs' } });

    expect(savedIds().at(-1)).toBe('agent.codex');
    expect(ids().at(-1)).toBe('agent.codex');
    expect(toasts().join('|')).toContain('已新建');
    // 过滤器没被碰
    expect(_currentOneApiFilterDoc()!.filters!.factory!.rules!.map((r) => r.id)).toEqual(['no-agents']);
  });

  it('editing keeps the classifier where it is', async () => {
    await open();
    await row('chat.tavern').find('[data-test="classifier-edit"]').trigger('click');
    expect(dialog().props('classifier')).toMatchObject({ id: 'chat.tavern' });

    await submitFromDialog(
      { id: 'chat.tavern', name: '酒馆', when: { field: 'header.user-agent', op: 'contains', value: 'Tavern' } },
      'chat.tavern',
    );

    expect(savedIds()).toEqual(['agent.claude', 'chat.tavern', 'chat.app', 'chat.webview']);
    expect(row('chat.tavern').find('.cls-card__name').text()).toBe('酒馆');
  });

  it('a classifier the gateway cannot read is not saved, and the dialog is told why', async () => {
    await open();
    await wrapper.find('[data-test="classifier-create"]').trigger('click');

    await submitFromDialog({ id: 'agent.nested', when: { classifier: 'chat.app' } });

    expect(savedIds()).not.toContain('agent.nested');
    expect(dialog().props('problems')).toEqual(['A classifier cannot refer to another classifier.']);
    expect(dialog().props('modelValue')).toBe(true);
  });

  it('without the write permission the page only shows', async () => {
    granted.clear();
    await open();

    expect(ids()).toHaveLength(4);
    expect(wrapper.find('[data-test="classifier-create"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="classifier-edit"]').exists()).toBe(false);
  });

  it('with no document yet, the first classifier creates it', async () => {
    _resetOneApiFilterMock(null);
    await open();
    expect(wrapper.text()).toContain('还没有分类器');

    await submitFromDialog({ id: 'chat.app', when: { field: 'header.user-agent', op: 'exists' } });

    expect(savedIds()).toEqual(['chat.app']);
    expect(ids()).toEqual(['chat.app']);
  });
});

describe('condition editor', () => {
  const classifiers = [{ id: 'chat.app', name: '聊天 App' }, { id: 'agent.claude' }];

  function editor(initial: unknown, refs: typeof classifiers | null = classifiers) {
    return mount(ConditionEditor, {
      props: { initial, schema: MOCK_FILTER_SCHEMA, classifiers: refs },
      global: { plugins: [ElementPlus] },
    });
  }

  /** 第 n 行（按出现顺序，套着的组里的也算）上某个下拉框。 */
  const selectIn = (w: ReturnType<typeof editor>, test: string, n = 0) =>
    w.findAllComponents({ name: 'ElSelect' }).filter((c) => c.attributes('data-test') === test)[n]!;
  const labels = (select: ReturnType<typeof selectIn>) =>
    select.findAllComponents({ name: 'ElOption' }).map((o) => o.props('label'));
  const read = (w: ReturnType<typeof editor>) => (w.vm as unknown as { read(): unknown }).read();

  it('hands back any condition the form can edit unchanged, nested groups included', () => {
    for (const when of [
      { classifier: ['chat.app', 'agent.claude'] },
      { any: [{ not: { classifier: 'chat.app' } }, { field: 'header.origin', op: 'exists' }] },
      {
        any: [
          { field: 'header.user-agent', op: 'prefix', value: 'claude-cli/' },
          { all: [{ field: 'prompt.system', op: 'contains', value: 'You are' }, { field: 'tools.count', op: 'gte', value: 3 }] },
        ],
      },
    ]) {
      const w = editor(when);
      expect(w.find('[data-test="cond-json"]').exists()).toBe(false);
      expect(read(w)).toEqual({ ok: true, when });
      w.unmount();
    }
  });

  it('draws a nested group inside its parent', () => {
    const w = editor({ any: [{ classifier: 'chat.app' }, { all: [{ classifier: 'agent.claude' }, { field: 'tools.name', op: 'exists' }] }] });

    expect(w.findAll('.cgroup').map((g) => g.attributes('data-depth'))).toEqual(['0', '1']);
    expect(w.findAll('.cgroup[data-depth="1"] .cond-row')).toHaveLength(2);
  });

  it('a condition the form cannot edit opens as JSON and comes back as written', () => {
    const when = { all: [{ any: [] }] };
    const w = editor(when);

    expect(w.find('[data-test="cond-json"]').exists()).toBe(true);
    expect(read(w)).toEqual({ ok: true, when });
  });

  it('a new filter rule starts with a classifier row; a new classifier starts with a header row', () => {
    const rule = editor(undefined);
    expect(rule.find('.cond-row').attributes('data-kind')).toBe('classifier');
    expect(read(rule)).toEqual({ ok: false, error: '有条件没选分类器' });

    const classifier = editor(undefined, null);
    expect(classifier.find('.cond-row').attributes('data-source')).toBe('header');
  });

  it('a row picks a source, then a level', () => {
    expect(labels(selectIn(editor(undefined, null), 'cond-source'))).toEqual(['请求头', '提示词', '工具']);
    expect(labels(selectIn(editor(undefined), 'cond-source'))).toEqual(['分类器', '请求头', '提示词', '工具']);

    const prompt = editor({ field: 'prompt.user', op: 'contains', value: 'x' }, null);
    expect(labels(selectIn(prompt, 'cond-level'))).toEqual(['系统', '用户', '助手']);
    const tools = editor({ field: 'tools.name', op: 'exists' }, null);
    expect(labels(selectIn(tools, 'cond-level'))).toEqual(['名称', '描述', '数量']);
    expect(labels(selectIn(tools, 'cond-op'))).toEqual(['包含任一', '全部包含', '开头是', '有值']);
  });

  it('switching to 提示词 starts at the system level and matches by contains', async () => {
    const w = editor(undefined, null);
    selectIn(w, 'cond-source').vm.$emit('change', 'prompt');
    await flushPromises();

    expect(w.find('.cond-row').attributes('data-source')).toBe('prompt');
    expect(read(w)).toEqual({ ok: false, error: '有条件没填值' });
    expect(selectIn(w, 'cond-level').props('modelValue')).toBe('prompt.system');
    expect(selectIn(w, 'cond-op').props('modelValue')).toBe('contains');
  });

  it('switching a level to 数量 gives a number input and writes a number', async () => {
    const w = editor({ field: 'tools.name', op: 'contains_any', value: ['Bash'] }, null);
    selectIn(w, 'cond-level').vm.$emit('change', 'tools.count');
    await flushPromises();

    const input = w.findComponent({ name: 'ElInputNumber' });
    expect(input.exists()).toBe(true);
    input.vm.$emit('update:modelValue', 4);
    await flushPromises();
    expect(read(w)).toEqual({ ok: true, when: { field: 'tools.count', op: 'gte', value: 4 } });
  });

  it('adding a group nests it under the current one and it can be removed again', async () => {
    const w = editor({ classifier: 'chat.app' });
    await w.find('[data-test="add-group"]').trigger('click');

    expect(w.findAll('.cgroup[data-depth="1"]')).toHaveLength(1);
    const nested = w.findAllComponents({ name: 'ConditionGroupEditor' })[1]!;
    nested.vm.$emit('remove');
    await flushPromises();
    expect(w.findAll('.cgroup[data-depth="1"]')).toHaveLength(0);
  });
});
