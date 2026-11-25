import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  MOCK_FAIL_MAKER,
  MOCK_OWNER_MAKER,
  OneApiRatecardMock,
  _resetOneApiRatecardMock,
} from '../services/mock/oneapiRatecardMock';
import RatecardView from '../views/RatecardView.vue';

/**
 * 模型价格页整页挂起来点一遍：列表、搜索、改价、删除、同步、没发布出去时的提示这几条线接没接对。
 * 数据用这一页自己的 mock（规矩在 oneapiRatecard.spec.ts 里钉着），这里只看页面把它用对了没有。
 */

const granted = vi.hoisted(() => new Set<string>());

// 不管 .env 里配的是什么，这里都只用内存里的 mock：页面的测试绝不能把请求打到真的平台上去
vi.mock('../services', async () => {
  const { OneApiRatecardMock: Mock } = await import('../services/mock/oneapiRatecardMock');
  const port = new Mock();
  return { getOneApiRatecardPort: () => port };
});

vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({
    hasPermission: (...codes: string[]) => codes.some((c) => granted.has(c)),
  }),
}));

// 二次确认一律点「确认」
vi.mock('@/shared/composables/useConfirm', () => ({ confirmDanger: vi.fn(async () => true) }));

const port = new OneApiRatecardMock();

let wrapper: VueWrapper;

async function settle(ms = 0): Promise<void> {
  if (ms > 0) await new Promise((resolve) => setTimeout(resolve, ms));
  await flushPromises();
  await flushPromises();
}

async function open(): Promise<void> {
  wrapper = mount(RatecardView, {
    global: { plugins: [ElementPlus] },
    attachTo: document.body,
  });
  await settle();
}

const makers = (): string[] => wrapper.findAll('.maker-item__name').map((n) => n.text());
const models = (): string[] => wrapper.findAll('.price-row__name').map((n) => n.text());
/** 弹出来的那几句提示（ElMessage 挂在 body 上）。 */
const toasts = (): string[] =>
  [...document.body.querySelectorAll('.el-message')].map((m) => m.textContent?.trim() ?? '');
/**
 * 发布顺利的时候页面上一个字都不提它：没有提示块、没有状态条、弹出来的话里也没有「发布」。
 * 发布是号池后台在每个写操作之后自己做的，成了不是一件要告诉人的事。
 */
function expectSilentAboutPublishing(): void {
  expect(wrapper.find('.publish-alert').exists()).toBe(false);
  expect(wrapper.find('.status-strip').exists()).toBe(false);
  expect(toasts().join('|')).not.toContain('发布');
}

function button(label: string): ReturnType<VueWrapper['find']> | undefined {
  return wrapper.findAll('button').find((b) => b.text().trim() === label);
}

/** 弹窗传送到了 body 上，不在组件自己的节点里。只看开着的那一个。 */
function dialog(): HTMLElement {
  const open = [...document.body.querySelectorAll<HTMLElement>('.el-dialog')].filter(
    (d) => d.closest<HTMLElement>('.el-overlay')?.style.display !== 'none',
  );
  expect(open).toHaveLength(1);
  return open[0]!;
}

function dialogButton(label: string): HTMLButtonElement {
  const found = [...dialog().querySelectorAll('button')].find(
    (b) => b.textContent?.trim() === label,
  );
  if (!found) throw new Error(`no "${label}" button in the open dialog`);
  return found;
}

async function selectMaker(name: string): Promise<void> {
  await wrapper
    .findAll('.maker-item')
    .find((m) => m.text().includes(name))!
    .trigger('click');
  await settle();
}

async function rowOf(modelKey: string): Promise<ReturnType<VueWrapper['find']>> {
  const found = wrapper
    .findAll('article.price-row')
    .find((r) => r.find('.price-row__name').text() === modelKey);
  if (!found) throw new Error(`${modelKey} is not on the page`);
  return found;
}

beforeEach(() => {
  vi.stubEnv('VITE_MOCK_DELAY_MS', '0');
  vi.stubGlobal('fetch', () => {
    throw new Error('the page must not reach the network in tests');
  });
  _resetOneApiRatecardMock();
  granted.clear();
  granted.add('platform.settings.read').add('platform.settings.write');
});

afterEach(() => {
  wrapper?.unmount();
  document.body.innerHTML = '';
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('model ratecard page', () => {
  it("lists the makers and the first maker's models", async () => {
    await open();

    expect(makers()).toEqual(['OpenAI', 'Anthropic', 'Google', 'DeepSeek', 'NovelAI', '其他']);
    expect(models()).toEqual([
      'gpt-5-mini',
      'gpt-5.2',
      'gpt-image-1',
      'sora-2',
      'text-embedding-3-large',
      'tts-1',
      'whisper-1',
    ]);
    expect(wrapper.find('.maker-sidebar__foot').text()).toContain('19 个模型');
    expectSilentAboutPublishing();
    // 页头上只有一个动作：没有「发布」，也没有「导入」
    expect(
      wrapper.findAll('.page-header__actions button').map((b) => b.text().trim()),
    ).toEqual(['同步全部']);

    await selectMaker('Anthropic');
    expect(models()).toContain('claude-3-haiku-20240307');
    expect(wrapper.find('.detail-sub').text()).toBe('5 个模型 · 美元牌价');
  });

  it('shows prices as they are and the tiers the price column has no place for', async () => {
    await open();
    // 0.025 不能写成 0.03
    expect((await rowOf('gpt-5-mini')).find('.price-row__price').text()).toContain('0.025');

    await selectMaker('Google');
    expect((await rowOf('gemini-2.5-flash-image')).find('.price-row__hint').text()).toMatch(
      /^图像出 .*30\.00 · models\.dev$/,
    );
  });

  it('a reader sees the table and nothing to change it with', async () => {
    granted.delete('platform.settings.write');
    await open();

    expect(models().length).toBeGreaterThan(0);
    for (const label of ['同步全部', '新建厂家', '新建模型', '上游同步'])
      expect(button(label)).toBeUndefined();
    expect(wrapper.find('.price-row__ops').exists()).toBe(false);
  });

  it('searches on the server and keeps only the makers that match', async () => {
    await open();
    await wrapper.find('.provider-sidebar__toolbar input').setValue('haiku');
    // 停手一会儿才搜
    await settle(320);

    expect(makers()).toEqual(['Anthropic']);
    expect(models()).toEqual(['claude-3-haiku', 'claude-3-haiku-20240307', 'claude-haiku-4-5']);

    await wrapper.find('.provider-sidebar__toolbar input').setValue('zzz');
    await settle(320);
    expect(makers()).toEqual([]);
    expect(wrapper.text()).toContain('没有匹配的模型');
  });

  it('deletes a row and drops a maker left with nothing', async () => {
    await open();
    await selectMaker('NovelAI');
    await (await rowOf('nai-diffusion-4-5-full'))
      .find('.price-row__ops button[title="删除"]')
      .trigger('click');
    await settle();

    expect(makers()).not.toContain('NovelAI');
    // 选中的那家没了：落到第一家
    expect(wrapper.find('.provider-detail__title').text()).toBe('OpenAI');
    expect(toasts()).toContain('已删除 nai-diffusion-4-5-full');
    expectSilentAboutPublishing();
  });

  it('edits the very row that was clicked and keeps the tiers the form does not know', async () => {
    await open();
    await selectMaker('Google');
    await (await rowOf('gemini-2.5-flash-image'))
      .find('.price-row__ops button[title="编辑"]')
      .trigger('click');
    await settle();

    expect(dialog().textContent).toContain('编辑牌价');
    expect(dialog().textContent).toContain('gemini-2.5-flash-image');
    // 第一个输入框是入价
    const input = dialog().querySelector<HTMLInputElement>('.pf__input')!;
    expect(input.value).toBe('0.3');
    input.value = '0.35';
    input.dispatchEvent(new Event('input'));
    dialogButton('保存').click();
    await settle();

    const saved = await port.find('gemini-2.5-flash-image');
    expect(saved.success && saved.data?.rate).toEqual({
      input: { perMToken: 0.35 },
      // 表单里没有图像出价这一档：改了入价，它还在
      output: { perMToken: 2.5, image: 30 },
    });
    expect(toasts()).toContain('已保存 gemini-2.5-flash-image');
    expectSilentAboutPublishing();
    expect((await rowOf('gemini-2.5-flash-image')).find('.price-row__price').text()).toContain(
      '0.35',
    );
  });

  it('creates a model under the selected maker in two steps, after checking the name is free', async () => {
    await open();
    await selectMaker('Anthropic');
    await button('新建模型')!.trigger('click');
    await settle();

    // 表里已经有的名字（哪怕换了一种写法）不让建
    const name = dialog().querySelector<HTMLInputElement>('input')!;
    name.value = 'anthropic/claude-sonnet-4.6';
    name.dispatchEvent(new Event('input'));
    dialogButton('下一步').click();
    await settle();
    expect(dialog().textContent).toContain('新建模型');

    name.value = 'claude-next-20270101';
    name.dispatchEvent(new Event('input'));
    dialogButton('下一步').click();
    await settle();

    // 第二步：填价。标题上是存进去的那个键（日期钉已经剥掉）
    expect(dialog().textContent).toContain('新建牌价');
    expect(dialog().textContent).toContain('claude-next');
    expect(dialog().textContent).not.toContain('20270101');
    const [inputPrice, , , outputPrice] = [
      ...dialog().querySelectorAll<HTMLInputElement>('.pf__input'),
    ];
    inputPrice!.value = '4';
    inputPrice!.dispatchEvent(new Event('input'));
    outputPrice!.value = '20';
    outputPrice!.dispatchEvent(new Event('input'));
    dialogButton('保存').click();
    await settle();

    const created = await port.find('claude-next');
    expect(created.success && created.data).toMatchObject({
      modelKey: 'claude-next',
      maker: 'anthropic',
      billingType: 'per_token',
      rate: { input: { perMToken: 4 }, output: { perMToken: 20 } },
    });
    expect(models()).toContain('claude-next');
    expectSilentAboutPublishing();
  });

  it('syncs one maker from upstream: differences come ticked, applying writes them', async () => {
    await open();
    await button('上游同步')!.trigger('click');
    await settle();

    const sync = dialog();
    expect(sync.textContent).toContain('上游同步 · OpenAI');
    // 默认只看有差异的：一条变价、一条新增，都勾着
    const keys = [...sync.querySelectorAll('.col-key')].map((td) =>
      td.textContent?.replace(/\s+/g, ''),
    );
    expect(keys).toEqual(['gpt-5-mini变价', 'gpt-5.2-pro新增']);
    expect(sync.querySelectorAll('.diff-row--picked')).toHaveLength(2);

    // 点一行取消勾选，只套用剩下的那条
    sync.querySelector<HTMLElement>('.diff-row')!.click();
    await settle();
    dialogButton('套用 1 条').click();
    await settle();

    expect(models()).toContain('gpt-5.2-pro');
    expect((await rowOf('gpt-5-mini')).find('.price-row__price').text()).toContain('0.025');
    expectSilentAboutPublishing();
  });

  it('an empty table offers to sync it from upstream, not to import one', async () => {
    // 把表删空：新装的环境就是这样，价格要从上游同步进来
    const all = await port.listByMaker({ keyword: '' });
    if (all.success)
      for (const row of all.data.flatMap((g) => g.items)) await port.remove(row.id);
    await open();

    expect(wrapper.text()).toContain('还没有模型价格');
    expect(button('导入')).toBeUndefined();
    expect(button('新建厂家')).toBeDefined();
    // 空表里和页头上各有一个「同步全部」
    expect(wrapper.findAll('button').filter((b) => b.text().trim() === '同步全部')).toHaveLength(2);
  });

  it('takes the table over when it is registered to another database', async () => {
    // mock 里往这个厂家写一行，这份表登记的主人就成了别的库：之后的写操作一律发布不出去
    await port.upsert({
      modelKey: 'moved-1',
      maker: MOCK_OWNER_MAKER,
      billingType: 'per_call',
      rate: { pricePerCall: 1 },
    });
    await open();
    // 打开页面本身不去发布，也就不知道：要到下一次改东西，回包才说没发出去
    expect(wrapper.find('.publish-alert').exists()).toBe(false);

    await selectMaker('NovelAI');
    await (await rowOf('nai-diffusion-4-5-full'))
      .find('.price-row__ops button[title="删除"]')
      .trigger('click');
    await settle();

    const alert = wrapper.find('.publish-alert');
    expect(alert.text()).toContain('还没有发布出去');
    expect(alert.text()).toContain('整张表：');
    // 这一种号池后台自己重发多少次都一样：不说「会自动重发」，摆的是「接管发布」
    expect(alert.text()).not.toContain('自动重发');
    const actions = (): string[] =>
      wrapper.findAll('.publish-alert__actions button').map((b) => b.text().trim());
    expect(actions()).toEqual(['接管发布', '关闭']);

    await wrapper
      .findAll('.publish-alert__actions button')
      .find((b) => b.text().trim() === '接管发布')!
      .trigger('click');
    await settle();

    expect(wrapper.find('.publish-alert').exists()).toBe(false);
    // 接管以后写操作照常发布
    const again = await port.upsert({
      modelKey: 'gpt-6',
      maker: 'openai',
      billingType: 'per_call',
      rate: { pricePerCall: 1 },
    });
    expect(again.success && again.data.publish.ok).toBe(true);
  });

  it('says so when a change was saved but did not go out, with nothing to click but close', async () => {
    // 表里有一家发布不出去（mock 里叫这个名字的厂家总是失败）
    await port.upsert({
      modelKey: 'flaky-1',
      maker: MOCK_FAIL_MAKER,
      billingType: 'per_call',
      rate: { pricePerCall: 1 },
    });
    await open();
    expect(wrapper.find('.publish-alert').exists()).toBe(false);

    await selectMaker('Fail-demo');
    await (await rowOf('flaky-1')).find('.price-row__ops button[title="删除"]').trigger('click');
    await settle();

    const alert = wrapper.find('.publish-alert');
    expect(alert.text()).toContain('已保存，但还没有发布出去');
    expect(alert.text()).toContain('Fail-demo：mock：模拟这个厂家发布失败。');
    // 号池后台自己会重发：说一声，不给「发布」「重新发布」按钮
    expect(alert.text()).toContain('号池后台会自动重发');
    expect(
      wrapper.findAll('.publish-alert__actions button').map((b) => b.text().trim()),
    ).toEqual(['关闭']);
    for (const label of ['发布', '重新发布', '接管发布']) expect(button(label)).toBeUndefined();
    expect(toasts().join('|')).toContain('已删除 flaky-1，但还没有发布出去');

    // 别的厂家的写操作发布成了，这一家的提示不会跟着消失
    await selectMaker('NovelAI');
    await (await rowOf('nai-diffusion-4-5-full'))
      .find('.price-row__ops button[title="删除"]')
      .trigger('click');
    await settle();
    expect(wrapper.find('.publish-alert').text()).toContain('Fail-demo');

    await button('关闭')!.trigger('click');
    await settle();
    expect(wrapper.find('.publish-alert').exists()).toBe(false);
  });
});
