import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Jastalk 的「渠道」「模型定价」两页整页挂起来看一遍：价按渠道定（照 Yomi 的供应商组、模型定价两页分），
 * 渠道页只管接入，定价页只管价。数据用这一块自己的 mock（规矩在 jastalkChannels.spec.ts 里钉着），
 * 这里只看页面把它用对了没有。
 */

/**
 * 不管 .env 里配的是什么，这里都只用内存里的 mock：页面的测试绝不能把请求打到真的平台上去。
 * mock 的数据记在它那个模块里、没有「回到种子」的入口，所以每条用例把模块表清掉、重新登记一次：
 * 页面和 mock 都重新载入，拿到的是一份新的种子数据，上一条用例改过的不会带过来。
 */
function useFreshMock(): void {
  vi.resetModules();
  vi.doMock('../services', async () => {
    const { JastalkAdminMock } = await import('../services/mock/jastalkAdminMock');
    const port = new JastalkAdminMock();
    return { getJastalkAdminPort: () => port };
  });
}

// 二次确认一律点「确认」
vi.mock('@/shared/composables/useConfirm', () => ({ confirmDanger: vi.fn(async () => true) }));

let wrapper: VueWrapper;

/** mock 里有几个接口是固定等一两百毫秒的，不跟着环境变量走：等够了再看。 */
async function settle(ms = 450): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
  await flushPromises();
  await flushPromises();
}

async function open(view: 'rates' | 'channels'): Promise<void> {
  const mod =
    view === 'rates'
      ? await import('../views/JastalkRatesView.vue')
      : await import('../views/JastalkChannelsView.vue');
  wrapper = mount(mod.default, { global: { plugins: [ElementPlus] }, attachTo: document.body });
  await settle();
}

const channelNames = (): string[] =>
  wrapper.findAll('.provider-sidebar__item-title').map((n) => n.text());

async function selectChannel(name: string): Promise<void> {
  await wrapper
    .findAll('.provider-sidebar__item')
    .find((c) => c.find('.provider-sidebar__item-title').text() === name)!
    .trigger('click');
  await settle();
}

const clean = (s: string): string => s.replace(/\s+/g, ' ').trim();

/** 「模型」那一格：名称、名称后面的标签（停用、未定价）、下面那行模型名，各是各的元素，分开取再拼。 */
function modelCell(tr: ReturnType<VueWrapper['find']>): string {
  const name = clean(tr.find('.model-name > span').text());
  const tags = tr.findAll('.model-name .el-tag').map((t) => clean(t.text()));
  const key = tr.find('.cell-sub');
  return [name, ...tags, ...(key.exists() ? [clean(key.text())] : [])].join(' ');
}

/** 现在摆着的那张表里每一行：一格一段，用 | 隔开（藏着的那一栏不算）。 */
function rows(): string[] {
  const shown = wrapper
    .findAll('.provider-detail__table-wrap')
    .find((w) => (w.element as HTMLElement).style.display !== 'none')!;
  return shown.findAll('.el-table__body tbody tr').map((tr) =>
    [
      modelCell(tr),
      ...tr
        .findAll('td')
        .slice(1)
        .map((td) => clean(td.text())),
    ].join(' | '),
  );
}

const stats = (): string[] => wrapper.findAll('.provider-detail__stats span').map((s) => clean(s.text()));

async function openTab(label: string): Promise<void> {
  await wrapper
    .findAll('.el-tabs__item')
    .find((t) => t.text().includes(label))!
    .trigger('click');
  await settle(50);
}

const buttons = (): string[] => wrapper.findAll('button').map((b) => b.text().trim());
const headers = (): string[] =>
  [...new Set(wrapper.findAll('.el-table__header th').map((th) => th.text().trim()))].filter(Boolean);

beforeEach(() => {
  useFreshMock();
  vi.stubEnv('VITE_MOCK_DELAY_MS', '0');
  vi.stubGlobal('fetch', () => {
    throw new Error('the page must not reach the network in tests');
  });
});

afterEach(() => {
  wrapper?.unmount();
  document.body.innerHTML = '';
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('jastalk model pricing page', () => {
  it('is laid out by channel: the channel multiplier on top, its models and their point prices below', async () => {
    await open('rates');

    expect(channelNames()).toEqual(['Antigravity', 'Claude', 'Codex', 'Kiro', '媒体']);

    await selectChannel('Kiro');
    expect(wrapper.find('.provider-detail__title').text()).toBe('Kiro');
    // 右上角那个数就是这个渠道的倍率
    expect(wrapper.find('.mult').text().replace(/\s+/g, '')).toBe('×7渠道倍率');
    expect(rows()).toEqual([
      'Claude Opus 5.5 claude-opus-5.5 | 对话 | 输入 3,500 · 输出 17,500 / 百万 token | 跟随渠道 | 定价',
      'Claude Sonnet 5.5 claude-sonnet-5.5 | 对话 | 输入 2,100 · 输出 10,500 / 百万 token | 跟随渠道 | 定价',
    ]);

    // 换一个渠道，倍率和模型都是那个渠道自己的
    await selectChannel('Claude');
    expect(wrapper.find('.mult').text()).toContain('×7.3');
    expect(rows()).toEqual([
      'Claude Haiku 5.5 claude-haiku-5-5 | 对话 | 输入 600 · 输出 3,000 / 百万 token | 单独定价 | 定价',
    ]);
  });

  it('has no flat table to hand-fill, no aliases, and nothing to recompute by hand', async () => {
    await open('rates');

    for (const label of ['添加价格', '改价', '重算', '全量重算有效价']) expect(buttons()).not.toContain(label);
    // 一行就是一个模型：没有「别名」这一列，也没有让人手敲渠道、模型的输入框
    expect(headers()).toEqual(['模型', '类别', '价格（积分）', '来源', '操作', '差什么']);
    expect(wrapper.text()).not.toContain('别名');
  });

  it('lists the models without a price in their own tab, each saying what is missing', async () => {
    await open('rates');
    await selectChannel('媒体');

    expect(stats()).toEqual(['已定价 3', '未定价 1']);
    await openTab('未定价');
    expect(rows()).toEqual(['SenseVoice FunAudioLLM/SenseVoiceSmall | 语音听写 | 牌价里没有这个模型 | 定价']);
  });

  it('sets the multiplier of the selected channel, and its models are repriced', async () => {
    await open('rates');
    // 这个渠道没设过倍率：它的模型现在落在不分渠道的旧价格上
    expect(wrapper.find('.provider-detail__title').text()).toBe('Antigravity');
    expect(wrapper.find('.mult').text()).toContain('未设置');
    expect(rows()[0]).toContain('默认价格');

    await wrapper.find('.mult').trigger('click');
    await settle(100);
    const drawer = document.body.querySelector<HTMLElement>('.el-drawer')!;
    expect(drawer.textContent).toContain('渠道倍率');
    const input = drawer.querySelector<HTMLInputElement>('.el-input-number input')!;
    input.value = '8';
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new Event('change'));
    const save = [...drawer.querySelectorAll('button')].find((b) => b.textContent?.trim() === '保存')!;
    save.click();
    await settle(900);

    expect(wrapper.find('.mult').text()).toContain('×8');
    expect(rows()[0]).toContain('跟随渠道');
  });

  it('shows the wildcard prices left from the flat table so they can be removed, and offers no way to add one', async () => {
    await open('rates');

    const notice = wrapper.find('.wildcards');
    expect(notice.text()).toContain('还有 1 条不分渠道的旧价格在生效');
    expect(notice.findAll('.wildcards__list li')).toHaveLength(1);
    expect(clean(notice.find('.wildcards__scope').text())).toBe('所有模型');
    expect(clean(notice.find('.wildcards__list .num').text())).toBe('输入 300 · 输出 1,500 / 百万 token');

    await notice.find('button').trigger('click');
    await settle(900);

    expect(wrapper.find('.wildcards').exists()).toBe(false);
    // 原来落在它上面的模型没有价了：到「未定价」里，写着差的是渠道倍率
    expect(stats()).toEqual(['已定价 0', '未定价 1']);
    await openTab('未定价');
    expect(rows()).toEqual(['Gemini 3.8 Flash 停用 gemini-3.8-flash | 对话 | 渠道没设倍率 | 定价']);
  });
});

describe('jastalk channels page', () => {
  it('only manages which models are connected: no prices, no pricing actions', async () => {
    await open('channels');
    await selectChannel('媒体');

    expect(wrapper.find('.provider-detail__stats').text().trim()).toBe('4 个模型');
    expect(buttons()).toContain('渠道设置');
    for (const label of ['定价', '重算']) expect(buttons()).not.toContain(label);
    expect(wrapper.find('.mult').exists()).toBe(false);

    const connected = wrapper.findAll('.provider-detail__table-wrap')[0]!;
    expect(
      [...new Set(connected.findAll('.el-table__header th').map((th) => th.text().trim()))].filter(Boolean),
    ).toEqual(['模型', '类别', '排序', '操作']);
    // 没有价的用户选不了：在这儿标一下，价去「模型定价」页定
    const marked = connected
      .findAll('.el-table__body tbody tr')
      .filter((tr) => tr.text().includes('未定价'))
      .map((tr) => modelCell(tr));
    expect(marked).toEqual(['SenseVoice 未定价 FunAudioLLM/SenseVoiceSmall']);
  });
});
