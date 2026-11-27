import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import ClassifierDialog from '../components/filter/ClassifierDialog.vue';
import ConditionChips from '../components/filter/ConditionChips.vue';
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

const ids = (): string[] => wrapper.findAll('.cls-list .cls-row').map((r) => r.attributes('data-classifier') ?? '');
const row = (id: string) => wrapper.find(`.cls-list .cls-row[data-classifier="${id}"]`);
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

    expect(ids()).toEqual(['agent.claude', 'chat.tavern', 'chat.app', 'chat.phone']);
    expect(row('agent.claude').find('.cls-row__name').text()).toBe('Claude');
    expect(row('agent.claude').find('.cls-row__id').text()).toBe('agent.claude');
    expect(row('agent.claude').find('.chips').attributes('aria-label')).toBe(
      'user-agent 开头是 "claude-cli/" 或 提示词·系统 包含 "You are Claude Code"',
    );
    expect(row('agent.claude').findAll('.cls-row__use').map((t) => t.text())).toEqual([
      'Factory · no-agents',
      'Claude · own-client',
    ]);
    expect(row('chat.phone').findAll('.cls-row__use').map((t) => t.text())).toEqual(['Claude · tavern']);
  });

  it('a classifier no filter refers to can be moved and deleted', async () => {
    _resetOneApiFilterMock({
      classifiers: [
        { id: 'a.one', when: { field: 'header.origin', op: 'exists' } },
        { id: 'b.two', when: { field: 'header.referer', op: 'exists' } },
      ],
    });
    await open();
    expect(row('a.one').find('.cls-row__unused').text()).toBe('未引用');

    await row('b.two').find('[data-test="classifier-up"]').trigger('click');
    await settle();
    expect(savedIds()).toEqual(['b.two', 'a.one']);

    await row('a.one').find('[data-test="classifier-delete"]').trigger('click');
    await settle();
    expect(savedIds()).toEqual(['b.two']);
  });

  it('filters by category; the order column keeps the place in the whole list and reordering waits', async () => {
    await open();
    expect(
      wrapper.findAll('.cat-item').map((c) => `${c.find('.cat-item__name').text()} ${c.find('.cat-item__count').text()}`),
    ).toEqual(['全部 4', 'Agent 1', 'Chat 3']);

    await wrapper.find('[data-category="chat"]').trigger('click');
    expect(ids()).toEqual(['chat.tavern', 'chat.app', 'chat.phone']);
    expect(row('chat.tavern').find('.cls-row__order').text()).toBe('2');
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

  it('a rule on a whole category (agent.*) shows on each of them, and only the last of the category is kept from deletion', async () => {
    _resetOneApiFilterMock({
      classifiers: [
        { id: 'agent.claude', when: { field: 'header.user-agent', op: 'prefix', value: 'claude-cli/' } },
        { id: 'agent.codex', when: { field: 'header.originator', op: 'prefix', value: 'codex_' } },
        { id: 'chat.app', when: { field: 'header.user-agent', op: 'prefix', value: 'Kelivo' } },
      ],
      filters: { factory: { enforce: true, rules: [{ id: 'no-agents', action: 'deny', when: { classifier: 'agent.*' } }] } },
    });
    await open();

    expect(row('agent.claude').findAll('.cls-row__use').map((t) => t.text())).toEqual(['Factory · no-agents']);
    expect(row('agent.codex').findAll('.cls-row__use').map((t) => t.text())).toEqual(['Factory · no-agents']);
    expect(row('chat.app').find('.cls-row__unused').exists()).toBe(true);

    // 规则还认得 agent.claude：删 agent.codex 照删
    await row('agent.codex').find('[data-test="classifier-delete"]').trigger('click');
    await settle();
    expect(savedIds()).toEqual(['agent.claude', 'chat.app']);

    // agent.claude 是这一类最后一个：删了 agent.* 一个都对不上，factory 的过滤器整个不生效
    await row('agent.claude').find('[data-test="classifier-delete"]').trigger('click');
    await settle();
    expect(savedIds()).toContain('agent.claude');
    expect(toasts().join('|')).toContain('Factory 的「no-agents」');
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
      { id: 'chat.tavern', name: 'Tavern SillyTavern', when: { field: 'header.user-agent', op: 'contains', value: 'Tavern' } },
      'chat.tavern',
    );

    expect(savedIds()).toEqual(['agent.claude', 'chat.tavern', 'chat.app', 'chat.phone']);
    expect(row('chat.tavern').find('.cls-row__name').text()).toBe('Tavern SillyTavern');
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

describe('classifier page: categories on the left, pages on the right', () => {
  /** 一整套二十几个分类器的样子：agent 一大串，chat 几个。 */
  const many = (agents: number, chats: number) => ({
    classifiers: [
      ...Array.from({ length: agents }, (_, i) => ({
        id: `agent.a${String(i + 1).padStart(2, '0')}`,
        when: { field: 'header.user-agent', op: 'prefix', value: `a${i + 1}/` },
      })),
      ...Array.from({ length: chats }, (_, i) => ({
        id: `chat.c${i + 1}`,
        when: { field: 'header.user-agent', op: 'prefix', value: `c${i + 1}/` },
      })),
    ],
  });
  const next = async () => {
    await wrapper.find('.provider-pagination .btn-next').trigger('click');
    await settle();
  };
  const total = () => wrapper.find('.provider-pagination .el-pagination__total').text();

  it('shows ten a page, and the order column keeps counting on the next page', async () => {
    _resetOneApiFilterMock(many(12, 2));
    await open();

    expect(ids()).toHaveLength(10);
    expect(ids()[0]).toBe('agent.a01');
    expect(total()).toContain('14');

    await next();
    expect(ids()).toEqual(['agent.a11', 'agent.a12', 'chat.c1', 'chat.c2']);
    expect(row('agent.a11').find('.cls-row__order').text()).toBe('11');
  });

  it('picking a category on the left goes back to its first page', async () => {
    _resetOneApiFilterMock(many(12, 2));
    await open();
    await next();

    await wrapper.find('[data-category="chat"]').trigger('click');
    await settle();
    expect(ids()).toEqual(['chat.c1', 'chat.c2']);
    expect(wrapper.find('.provider-detail__title').text()).toBe('Chat');
    expect(wrapper.find('[data-category="chat"]').classes()).toContain('provider-sidebar__item--active');

    await wrapper.find('[data-category="agent"]').trigger('click');
    await settle();
    expect(ids()[0]).toBe('agent.a01');
  });

  it('a new classifier opens the page it landed on, under all categories when it is not the one being looked at', async () => {
    _resetOneApiFilterMock(many(12, 2));
    await open();
    await wrapper.find('[data-category="chat"]').trigger('click');
    await settle();

    await submitFromDialog({ id: 'bot.astrbot', when: { field: 'header.user-agent', op: 'prefix', value: 'astrbot/' } });

    expect(wrapper.find('.provider-detail__title').text()).toBe('全部分类器');
    expect(ids().at(-1)).toBe('bot.astrbot');
    expect(row('bot.astrbot').find('.cls-row__order').text()).toBe('15');
  });

  it('deleting the last one on the last page steps back a page instead of showing an empty one', async () => {
    _resetOneApiFilterMock(many(11, 0));
    await open();
    await next();
    expect(ids()).toEqual(['agent.a11']);

    await row('agent.a11').find('[data-test="classifier-delete"]').trigger('click');
    await settle();

    expect(savedIds()).toHaveLength(10);
    expect(ids()).toHaveLength(10);
  });
});

describe('condition chips in a list', () => {
  const chips = (when: unknown) =>
    mount(ConditionChips, { props: { when, compact: true }, global: { plugins: [ElementPlus] } });

  it('keeps a long condition to one line: nested groups and tool objects fold, extra values become +N', () => {
    const when = {
      any: [
        { field: 'header.user-agent', op: 'prefix', value: ['claude-cli/', 'Claude-Desktop/', 'x'] },
        { all: [{ field: 'prompt.system', op: 'contains', value: 'a' }, { field: 'prompt.user', op: 'contains', value: 'b' }] },
        { tool: { all: [{ field: 'name', op: 'eq', value: 'Bash' }, { field: 'description', op: 'contains', value: 'c' }] } },
      ],
    };
    const w = chips(when);

    expect(w.find('.chips').classes()).toContain('chips--compact');
    expect(w.findAll('.chip__value').map((v) => v.text())).toEqual(['claude-cli/']);
    expect(w.text()).toContain('+2');
    expect(w.findAll('.chip--more').map((c) => c.text())).toEqual(['2 个条件', '工具对象']);
    // 完整的那句话还在，悬停和读屏用
    expect(w.find('.chips').attributes('aria-label')).toContain('有工具（名称 等于 "Bash" 且 描述 包含 "c"）');
  });

  it('shortens a long value', () => {
    const w = chips({ field: 'prompt.system', op: 'contains', value: 'You are Claude Code, Anthropic official CLI for Claude.' });

    expect(w.find('.chip__value').text()).toBe('You are Claude Code, Ant…');
  });
});

describe('condition editor', () => {
  const classifiers = [{ id: 'chat.app', name: 'Chat' }, { id: 'agent.claude' }];

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

  it('a filter rule can pick a whole category (agent.*) as well as single classifiers, and keeps it as written', () => {
    const w = editor({ classifier: 'agent.*' });

    expect(labels(selectIn(w, 'cond-classifiers'))).toEqual([
      'Chat 全部（chat.*）',
      'Agent 全部（agent.*）',
      'chat.app（Chat）',
      'agent.claude',
    ]);
    expect(read(w)).toEqual({ ok: true, when: { classifier: 'agent.*' } });
  });

  it('a row picks a source, then a level', () => {
    expect(labels(selectIn(editor(undefined, null), 'cond-source'))).toEqual(['请求头', '提示词', '工具']);
    expect(labels(selectIn(editor(undefined), 'cond-source'))).toEqual(['分类器', '请求头', '提示词', '工具']);

    const prompt = editor({ field: 'prompt.user', op: 'contains', value: 'x' }, null);
    expect(labels(selectIn(prompt, 'cond-level'))).toEqual(['系统', '用户', '助手']);
    const tools = editor({ field: 'tools.name', op: 'exists' }, null);
    expect(labels(selectIn(tools, 'cond-level'))).toEqual(['名称', '数量']);
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

  it('a tool object holds conditions about one tool: name, description, params', async () => {
    const when = {
      tool: {
        all: [
          { field: 'name', op: 'eq', value: 'Bash' },
          { field: 'description', op: 'contains', value: 'Executes a given bash command' },
          { field: 'params', op: 'contains_all', value: ['command', 'timeout'] },
        ],
      },
    };
    const w = editor(when, null);

    expect(w.findAll('[data-test="tool-object"]')).toHaveLength(1);
    expect(w.findAll('[data-test="tool-object"] .cond-row').map((r) => r.attributes('data-source'))).toEqual([
      'name',
      'description',
      'params',
    ]);
    // 里面那一层的来源是这个工具自己的三样，没有分类器、没有再套一层的工具对象
    expect(labels(selectIn(w, 'cond-source'))).toEqual(['名称', '描述', '参数']);
    expect(w.find('[data-test="tool-object"] [data-test="add-tool"]').exists()).toBe(false);
    expect(read(w)).toEqual({ ok: true, when });
  });

  it('adding a tool object starts with a name and a description row', async () => {
    const w = editor({ field: 'header.user-agent', op: 'exists' }, null);
    await w.find('[data-test="add-tool"]').trigger('click');

    expect(w.findAll('[data-test="tool-object"] .cond-row').map((r) => r.attributes('data-source'))).toEqual([
      'name',
      'description',
    ]);
    // 名字和描述都还没填
    expect(read(w)).toEqual({ ok: false, error: '有条件没填值' });
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
