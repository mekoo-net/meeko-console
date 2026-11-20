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
 * 模型价格页整页挂起来点一遍：列表、搜索、改价、删除、发布结果这几条线接没接对。
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
/** 状态条上的字，去掉空白再比：段和段之间有没有空格是排版的事。 */
const strip = (): string => wrapper.find('.status-strip').text().replace(/\s+/g, '');

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
  it("lists the makers and the first maker's models, with where the table stands", async () => {
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
    expect(wrapper.find('.maker-sidebar__foot').text()).toContain('18 个模型');
    // 还没改过东西：只有转发、通知两段，没有「发布」
    expect(strip()).toContain('转发已收到6家');
    expect(strip()).toContain('通知yomijastalk');
    expect(strip()).not.toContain('发布');
    expect(wrapper.find('.publish-alert').exists()).toBe(false);

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
    for (const label of ['导入', '发布', '新建厂家', '新建模型', '上游同步'])
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

  it('deletes a row, says what was published, and drops a maker left with nothing', async () => {
    await open();
    await selectMaker('NovelAI');
    await (await rowOf('nai-diffusion-4-5-full'))
      .find('.price-row__ops button[title="删除"]')
      .trigger('click');
    await settle();

    expect(makers()).not.toContain('NovelAI');
    // 选中的那家没了：落到第一家
    expect(wrapper.find('.provider-detail__title').text()).toBe('OpenAI');
    expect(strip()).toContain('发布已撤下NovelAI');
    expect(strip()).toContain('转发已收到5家');
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
    expect(strip()).toContain('发布已发布Google');
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
    expect(strip()).toContain('发布已发布Anthropic');
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
    expect(strip()).toContain('发布已发布OpenAI');
  });

  it('imports a pasted table and shows how many rows went where', async () => {
    await open();
    await button('导入')!.trigger('click');
    await settle();

    const text = dialog().querySelector<HTMLTextAreaElement>('textarea')!;
    text.value = '{ "items": [';
    text.dispatchEvent(new Event('input'));
    await settle();
    expect(dialog().textContent).toContain('不是合法的 JSON');
    expect(dialogButton('导入').disabled).toBe(true);

    text.value = JSON.stringify({
      items: [
        {
          modelKey: 'gpt-5.2',
          billingType: 'per_token',
          rate: { input: { perMToken: 9 }, output: { perMToken: 9 } },
        },
        {
          modelKey: 'acme-x',
          maker: 'acme',
          billingType: 'per_call',
          rate: { pricePerCall: 0.01 },
        },
      ],
    });
    text.dispatchEvent(new Event('input'));
    await settle();
    expect(dialog().textContent).toContain('2 行');
    dialogButton('导入').click();
    await settle();

    // 没勾「覆盖已有的」：表里已有的那一行跳过
    expect(
      [...dialog().querySelectorAll('.import-count')].map((c) =>
        c.textContent?.replace(/\s+/g, ''),
      ),
    ).toEqual(['新增1', '覆盖0', '跳过1']);
    dialogButton('完成').click();
    await settle();
    expect(makers()).toContain('Acme');
    expect(strip()).toContain('发布已发布Acme');
  });

  it('takes the table over when it is registered to another database', async () => {
    // mock 里往这个厂家写一行，这份表登记的主人就成了别的库：之后的发布一律不写
    await port.upsert({
      modelKey: 'moved-1',
      maker: MOCK_OWNER_MAKER,
      billingType: 'per_call',
      rate: { pricePerCall: 1 },
    });
    await open();
    await button('发布')!.trigger('click');
    await settle();
    expect(wrapper.find('.publish-alert').text()).toContain('整张表：');
    expect(strip()).toContain('发布没有发布出去');

    // 这种失败再点发布还是同一个结果：提示里摆的是「接管发布」，不是「重新发布」。
    // 它只在这时候出现，平时不在更多菜单里摆着。
    const actions = (): string[] =>
      wrapper.findAll('.publish-alert__actions button').map((b) => b.text().trim());
    expect(actions()).toContain('接管发布');
    expect(actions()).not.toContain('重新发布');
    await wrapper.find('.page-header__actions .el-dropdown button').trigger('click');
    await settle();
    expect(
      [...document.body.querySelectorAll<HTMLElement>('.el-dropdown-menu__item')].map((i) =>
        i.textContent?.trim(),
      ),
    ).not.toContain('接管发布');

    await wrapper
      .findAll('.publish-alert__actions button')
      .find((b) => b.text().trim() === '接管发布')!
      .trigger('click');
    await settle();

    expect(wrapper.find('.publish-alert').exists()).toBe(false);
    expect(strip()).toContain('发布已发布Owner-demo');
    const again = await port.publish();
    expect(again.success && again.data.ok).toBe(true);
  });

  it('keeps a failed publish on top of the page until the whole table goes out', async () => {
    // 表里有一家发布不出去（mock 里叫这个名字的厂家总是失败）
    const flaky = await port.upsert({
      modelKey: 'flaky-1',
      maker: MOCK_FAIL_MAKER,
      billingType: 'per_call',
      rate: { pricePerCall: 1 },
    });
    await open();

    await button('发布')!.trigger('click');
    await settle();
    const alert = wrapper.find('.publish-alert');
    expect(alert.text()).toContain('没有发布出去');
    expect(alert.text()).toContain('Fail-demo：mock：模拟这个厂家发布失败。');
    expect(strip()).toContain('发布1家没有发布出去');

    // 别的厂家的写操作发布成了，这一条不会跟着消失
    await selectMaker('NovelAI');
    await (await rowOf('nai-diffusion-4-5-full'))
      .find('.price-row__ops button[title="删除"]')
      .trigger('click');
    await settle();
    expect(wrapper.find('.publish-alert').exists()).toBe(true);

    // 把发布不出去的那一行删了，再整张表发布一遍：成了，提示才清掉
    if (flaky.success) await port.remove(flaky.data.price.id);
    await button('重新发布')!.trigger('click');
    await settle();
    expect(wrapper.find('.publish-alert').exists()).toBe(false);
  });
});
