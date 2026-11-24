import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Jastalk 的「渠道」页整页挂起来看一遍：接入和定价在同一页，价按渠道定（版式照 Yomi 的渠道页，没有别名）。
 * 数据用这一块自己的 mock（规矩在 jastalkChannels.spec.ts 里钉着），这里只看页面把它用对了没有。
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

async function open(): Promise<void> {
  const mod = await import('../views/JastalkChannelsView.vue');
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

/** 现在摆着的那一栏（已接入 / 可接入），藏着的那一栏不算。 */
function shownTable(): ReturnType<VueWrapper['find']> {
  return wrapper
    .findAll('.provider-detail__table-wrap')
    .find((w) => (w.element as HTMLElement).style.display !== 'none' && w.element.closest<HTMLElement>('.available')?.style.display !== 'none')!;
}

/** 「模型」那一格：名称、名称后面的标签（停用、上游已下架）、下面那行模型名，各是各的元素，分开取再拼。 */
function modelCell(tr: ReturnType<VueWrapper['find']>): string {
  const name = clean(tr.find('.model-name > span').text());
  const tags = tr.findAll('.model-name .el-tag').map((t) => clean(t.text()));
  const key = tr.find('.cell-sub');
  return [name, ...tags, ...(key.exists() ? [clean(key.text())] : [])].join(' ');
}

/** 已接入的每一行：模型 | 类别 | 价格 | 来源 | 排序（最后那格是按钮，另看）。 */
function rows(): string[] {
  return shownTable()
    .findAll('.el-table__body tbody tr')
    .map((tr) =>
      [
        modelCell(tr),
        ...tr
          .findAll('td')
          .slice(1, -1)
          .map((td) => clean(td.text())),
      ].join(' | '),
    );
}

const rowOf = (name: string): string => rows().find((r) => r.startsWith(name)) ?? '';
const headers = (): string[] =>
  [...new Set(shownTable().findAll('.el-table__header th').map((th) => clean(th.text())))].filter(Boolean);
const stats = (): string[] => wrapper.findAll('.provider-detail__stats span').map((s) => clean(s.text()));
const buttons = (): string[] => wrapper.findAll('button').map((b) => b.text().trim());

async function openTab(label: string): Promise<void> {
  await wrapper
    .findAll('.el-tabs__item')
    .find((t) => t.text().includes(label))!
    .trigger('click');
  await settle();
}

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

describe('jastalk channels page', () => {
  it('prices by channel on the page that connects the models: the multiplier on top, each model with its point price', async () => {
    await open();

    expect(channelNames()).toEqual(['Antigravity', 'Claude', 'Codex', 'Kiro', '媒体']);

    await selectChannel('Kiro');
    expect(wrapper.find('.provider-detail__title').text()).toBe('Kiro');
    // 右上角那个数就是这个渠道的倍率
    expect(wrapper.find('.mult').text().replace(/\s+/g, '')).toBe('×7渠道倍率');
    expect(headers()).toEqual(['模型', '类别', '价格（积分）', '来源', '排序', '操作']);
    expect(rows()).toEqual([
      'Claude Opus 5.5 claude-opus-5.5 | 对话 | 输入 3,500 · 缓存 350 · 输出 17,500 / 百万 token | 跟随渠道 | 10',
      'Claude Sonnet 5.5 claude-sonnet-5.5 | 对话 | 输入 2,100 · 缓存 210 · 输出 10,500 / 百万 token | 跟随渠道 | 20',
    ]);
    // 接入的事和价的事在同一行上：编辑、定价、移除
    expect(
      shownTable()
        .find('.el-table__body tbody tr')
        .findAll('button')
        .map((b) => b.text().trim()),
    ).toEqual(['编辑', '定价', '移除']);

    // 换一个渠道，倍率和模型都是那个渠道自己的
    await selectChannel('Claude');
    expect(wrapper.find('.mult').text()).toContain('×7.3');
    expect(rows()).toEqual([
      'Claude Haiku 5.5 claude-haiku-5-5 | 对话 | 输入 600 · 缓存 60 · 输出 3,000 / 百万 token | 单独定价 | 30',
    ]);
  });

  it('has no hand-filled price table, no aliases, and nothing to recompute by hand', async () => {
    await open();

    for (const label of ['添加价格', '改价', '重算', '全量重算有效价']) expect(buttons()).not.toContain(label);
    expect(wrapper.text()).not.toContain('别名');
  });

  it('writes what is missing where the price of an unpriced model would be', async () => {
    await open();
    await selectChannel('媒体');

    expect(stats()).toEqual(['已定价 3', '未定价 1']);
    // 不留一个横线：写出差的是什么
    expect(rowOf('SenseVoice')).toBe(
      'SenseVoice FunAudioLLM/SenseVoiceSmall | 语音听写 | 牌价里没有这个模型 | 尚未定价 | 10',
    );
    expect(rows().filter((r) => r.includes('尚未定价'))).toHaveLength(1);
  });

  it('sets the multiplier of the selected channel, and its models are repriced', async () => {
    await open();
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

  it('puts up no notice about the default price: the models on it say so in their own row', async () => {
    await open();

    expect(wrapper.find('.notices').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('不分渠道');
    // 这个渠道没设倍率，它的模型落在默认价上：行上的来源写着
    expect(wrapper.find('.provider-detail__title').text()).toBe('Antigravity');
    expect(rows()[0]).toContain('默认价格');
  });

  it('connects models on the same page, showing what each would cost before it is connected', async () => {
    await open();
    await selectChannel('Kiro');
    await openTab('可接入');

    expect(headers()).toEqual(['模型', '牌价（美元）', '折合积分']);
    expect(shownTable().findAll('.el-table__body tbody tr').length).toBeGreaterThan(0);
    expect(buttons()).toContain('接入');
  });
});
