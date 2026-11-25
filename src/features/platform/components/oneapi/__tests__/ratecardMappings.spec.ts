import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import PriceModelCreateDialog from '../components/ratecard/PriceModelCreateDialog.vue';
import { failureText } from '../model/ratecard';
import { priceMakerGroupSchema } from '../model/ratecard.types';
import { OneApiRatecardMock, _resetOneApiRatecardMock } from '../services/mock/oneapiRatecardMock';
import RatecardView from '../views/RatecardView.vue';

/**
 * 映射：一个模型名按价格表里的另一行出价（目录里是 gemini-3.1-pro-preview，有的渠道叫 gemini-3.1-pro）。
 * 2026-11-25 用户先说「牌照价格 应该可以设置别名」，做成行上的一串别名以后又说：
 * 「应该是我可以创建 一个 模型 映射到一个 价格表的模型」——所以映射是新建模型时选的一种，单独一行列出来。
 */

const granted = vi.hoisted(() => new Set<string>());

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

vi.mock('@/shared/composables/useConfirm', () => ({ confirmDanger: vi.fn(async () => true) }));

const port = new OneApiRatecardMock();

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
  document.body.innerHTML = '';
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

async function rowNamed(key: string) {
  const r = await port.listByMaker({ keyword: '' });
  if (!r.success) throw new Error('list failed');
  const row = r.data.flatMap((g) => g.items).find((p) => p.modelKey === key);
  if (!row) throw new Error(`${key} is not in the table`);
  return row;
}

async function google() {
  const r = await port.listByMaker({ keyword: '' });
  if (!r.success) throw new Error('list failed');
  return r.data.find((g) => g.maker === 'google')!;
}

describe('ratecard mappings: the rules', () => {
  it('a group the vault sends without mappings reads as a vault that has none', () => {
    const group = priceMakerGroupSchema.parse({ maker: 'google', items: [] });
    expect(group.mappings).toBeUndefined();
  });

  it('a mapping is lowercased, listed in its target maker, published, and found by search', async () => {
    const pro = await rowNamed('gemini-2.5-pro');
    const r = await port.saveMapping({ modelKey: '  Gemini-Pro-Latest ', targetId: pro.id });
    expect(r.success && r.data.mapping).toMatchObject({ modelKey: 'gemini-pro-latest', targetId: pro.id, targetKey: 'gemini-2.5-pro' });
    // 映射跟着它指的那一行发布出去：各产品对牌价时要认它
    expect(r.success && r.data.publish).toMatchObject({ ok: true, written: ['google'] });
    expect((await google()).mappings?.map((m) => m.modelKey)).toEqual(['gemini-3.1-pro', 'gemini-pro-latest']);

    // 搜映射的名字：它和它指的那一行都出来
    const searched = await port.listByMaker({ keyword: 'pro-latest' });
    expect(searched.success && searched.data.flatMap((g) => g.items).map((p) => p.modelKey)).toEqual(['gemini-2.5-pro']);
    expect(searched.success && searched.data.flatMap((g) => g.mappings ?? []).map((m) => m.modelKey)).toEqual(['gemini-pro-latest']);
  });

  it('refuses a name that already has a price, is already mapped, or has spaces', async () => {
    const pro = await rowNamed('gemini-2.5-pro');
    const priced = await port.saveMapping({ modelKey: 'gemini-2-5-flash', targetId: pro.id });
    expect(!priced.success && failureText(priced.error)).toContain('already in the ratecard as gemini-2.5-flash');
    const mapped = await port.saveMapping({ modelKey: 'gemini-3.1-pro', targetId: pro.id });
    expect(!mapped.success && failureText(mapped.error)).toContain('already mapped to gemini-3.1-pro-preview');
    const spaced = await port.saveMapping({ modelKey: 'gemini pro', targetId: pro.id });
    expect(spaced.success).toBe(false);

    // 名字按另一行出价时，不让它再有自己的价
    const own = await port.upsert({ modelKey: 'gemini-3.1-pro', billingType: 'per_token', rate: { input: { perMToken: 1 }, output: { perMToken: 2 } } });
    expect(!own.success && failureText(own.error)).toContain('is mapped to gemini-3.1-pro-preview');
  });

  it('retargets and deletes a mapping; deleting the target takes its mappings along', async () => {
    const mapping = (await google()).mappings![0]!;
    const flash = await rowNamed('gemini-2.5-flash');
    const moved = await port.saveMapping({ id: mapping.id, targetId: flash.id });
    expect(moved.success && moved.data.mapping).toMatchObject({ modelKey: 'gemini-3.1-pro', targetKey: 'gemini-2.5-flash' });

    await port.remove(flash.id);
    expect((await google()).mappings).toEqual([]);

    const preview = await rowNamed('gemini-3.1-pro-preview');
    const again = await port.saveMapping({ modelKey: 'gemini-3.1-pro', targetId: preview.id });
    const removed = await port.removeMapping(again.success ? again.data.mapping.id : '');
    expect(removed.success).toBe(true);
    expect((await google()).mappings).toEqual([]);
  });
});

describe('ratecard mappings: the page', () => {
  let wrapper: VueWrapper;

  async function settle(): Promise<void> {
    await flushPromises();
    await flushPromises();
  }

  async function openGoogle(): Promise<void> {
    wrapper = mount(RatecardView, { global: { plugins: [ElementPlus] }, attachTo: document.body });
    await settle();
    await wrapper
      .findAll('.maker-item')
      .find((m) => m.text().includes('Google'))!
      .trigger('click');
    await settle();
  }

  const names = () => wrapper.findAll('.price-row__name').map((n) => n.text());
  const rowOf = (key: string) =>
    wrapper.findAll('article.price-row').find((r) => r.find('.price-row__name').text() === key)!;

  function openDialog(): HTMLElement {
    const open = [...document.body.querySelectorAll<HTMLElement>('.el-dialog')].filter(
      (d) => d.closest<HTMLElement>('.el-overlay')?.style.display !== 'none',
    );
    expect(open).toHaveLength(1);
    return open[0]!;
  }

  const dialogButton = (label: string) =>
    [...openDialog().querySelectorAll('button')].find((b) => b.textContent?.trim() === label)!;

  /** 打开弹窗里的下拉、点选一项（下拉也传送到了 body 上）。 */
  async function pick(label: string): Promise<void> {
    openDialog().querySelector<HTMLElement>('.el-select__wrapper')!.click();
    await settle();
    // 前一个弹窗的下拉还留在 body 上：取最后挂上去的那个
    const option = [...document.body.querySelectorAll<HTMLElement>('.el-select-dropdown__item')]
      .filter((o) => o.textContent?.trim() === label)
      .at(-1);
    if (!option) throw new Error(`no option "${label}"`);
    option.click();
    await settle();
  }

  afterEach(() => wrapper?.unmount());

  const target = (key: string) => rowOf(key).find('.price-row__follow code').text();

  it('hangs a mapping under the model it maps to, marked 手动, without repeating the price', async () => {
    await openGoogle();
    const at = names().indexOf('gemini-3.1-pro-preview');
    expect(names()[at + 1]).toBe('gemini-3.1-pro');
    const mapping = rowOf('gemini-3.1-pro');
    expect(mapping.classes()).toContain('price-row--mapping');
    expect(mapping.find('.price-row__follow').text()).toContain('映射到');
    expect(target('gemini-3.1-pro')).toBe('gemini-3.1-pro-preview');
    expect(mapping.find('.src-badge').text()).toBe('手动');
    // 价格看它上面那一行，不再摆一遍
    expect(mapping.find('.price-row__price').exists()).toBe(false);
    // 映射也算一个模型
    expect(wrapper.find('.detail-sub').text()).toContain('6 个模型');
  });

  it('creates a mapping from 新建模型, and changes what it maps to', async () => {
    await openGoogle();
    await wrapper.findAll('button').find((b) => b.text().trim() === '新建模型')!.trigger('click');
    await settle();

    [...openDialog().querySelectorAll<HTMLElement>('.el-radio-button')].find((b) => b.textContent?.trim() === '映射模型')!.click();
    await settle();
    const name = openDialog().querySelector<HTMLInputElement>('.el-input input')!;
    name.value = 'gemini-pro-x';
    name.dispatchEvent(new Event('input'));
    await pick('gemini-2.5-pro');
    dialogButton('创建').click();
    await settle();

    const at = names().indexOf('gemini-2.5-pro');
    expect(names()[at + 1]).toBe('gemini-pro-x');
    expect(target('gemini-pro-x')).toBe('gemini-2.5-pro');

    await rowOf('gemini-pro-x').find('.price-row__ops button[title="编辑"]').trigger('click');
    await settle();
    expect(openDialog().textContent).toContain('映射 · gemini-pro-x');
    await pick('gemini-2.5-flash');
    dialogButton('保存').click();
    await settle();
    expect(target('gemini-pro-x')).toBe('gemini-2.5-flash');

    await rowOf('gemini-pro-x').find('.price-row__ops button[title="删除"]').trigger('click');
    await settle();
    expect(names()).not.toContain('gemini-pro-x');
  });

  it('a name that is already mapped is stopped before pricing it', async () => {
    await openGoogle();
    await wrapper.findAll('button').find((b) => b.text().trim() === '新建模型')!.trigger('click');
    await settle();
    const name = openDialog().querySelector<HTMLInputElement>('.el-input input')!;
    name.value = 'gemini-3.1-pro';
    name.dispatchEvent(new Event('input'));
    dialogButton('下一步').click();
    await settle();
    expect(document.body.querySelector('.el-message')?.textContent).toContain('已经映射到 gemini-3.1-pro-preview');
    expect(openDialog().textContent).toContain('新建模型');
  });

  it('a reader sees mappings but cannot touch them', async () => {
    granted.delete('platform.settings.write');
    await openGoogle();
    expect(target('gemini-3.1-pro')).toBe('gemini-3.1-pro-preview');
    expect(rowOf('gemini-3.1-pro').find('.price-row__ops').exists()).toBe(false);
  });

  it('without mappings from the vault, 新建模型 only prices', async () => {
    const dialog = mount(PriceModelCreateDialog, {
      props: { modelValue: true, maker: 'google', models: [], mappings: [], canMap: false },
      global: { plugins: [ElementPlus] },
      attachTo: document.body,
    });
    await settle();
    expect(document.body.textContent).not.toContain('映射模型');
    dialog.unmount();
  });
});
