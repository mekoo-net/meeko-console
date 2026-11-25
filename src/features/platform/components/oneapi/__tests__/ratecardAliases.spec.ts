import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { failureText } from '../model/ratecard';
import { modelPriceRowSchema } from '../model/ratecard.types';
import { OneApiRatecardMock, _resetOneApiRatecardMock } from '../services/mock/oneapiRatecardMock';
import RatecardView from '../views/RatecardView.vue';

/**
 * 牌价的别名：渠道里对一个模型的别的叫法（目录里是 gemini-3.1-pro-preview，有的渠道叫 gemini-3.1-pro）。
 * 2026-11-25 用户：「牌照价格 应该可以设置别名 比如 gemini-3.1-pro-preview 同时 也是 gemini-3.1-pro」。
 * 也钉住：行上没有 aliases 这个字段（连着的号池后台是加别名之前的版本）时页面不摆它。
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

describe('list price aliases: the rules', () => {
  it('a row the vault sends without aliases reads as not supporting them', () => {
    const row = modelPriceRowSchema.parse({
      id: '1', modelKey: 'gemini-3.1-pro-preview', maker: 'google', billingType: 'per_token',
      rate: { input: { perMToken: 2 }, output: { perMToken: 12 } }, currency: 'USD', source: 'models_dev', effectiveFromUtc: 1763600000000,
    });
    expect(row.aliases).toBeUndefined();
  });

  it('keeps them lowercase and without repeats, and publishes the change', async () => {
    const row = await rowNamed('gemini-2.5-pro');
    const r = await port.setAliases(row.id, ['  Gemini-2.5-Pro-Latest ', 'gemini-2.5-pro-latest', '', 'g25-pro']);
    expect(r.success && r.data.price.aliases).toEqual(['gemini-2.5-pro-latest', 'g25-pro']);
    // 别名也发布出去：各产品对牌价时要认它
    expect(r.success && r.data.publish).toMatchObject({ ok: true, written: ['google'] });

    const cleared = await port.setAliases(row.id, []);
    expect(cleared.success && cleared.data.price.aliases).toEqual([]);
  });

  it('refuses an alias that is the model itself, or a name another row already has', async () => {
    const pro = await rowNamed('gemini-2.5-pro');
    const own = await port.setAliases(pro.id, ['gemini-2-5-pro']);
    expect(!own.success && failureText(own.error)).toContain('就是这个模型自己的名字');

    // 别的行的键
    const key = await port.setAliases(pro.id, ['gemini-2.5-flash']);
    expect(!key.success && failureText(key.error)).toContain('已经是 gemini-2.5-flash 的名字');
    // 别的行的别名
    const alias = await port.setAliases(pro.id, ['gemini-3.1-pro']);
    expect(!alias.success && failureText(alias.error)).toContain('已经是 gemini-3.1-pro-preview 的名字');
    // 带空格的
    const spaced = await port.setAliases(pro.id, ['gemini pro']);
    expect(spaced.success).toBe(false);
  });

  it('an alias is found like a key: searching, and checking a new name for duplicates', async () => {
    const found = await port.find('gemini-3.1-pro');
    expect(found.success && found.data?.modelKey).toBe('gemini-3.1-pro-preview');

    const searched = await port.listByMaker({ keyword: '3.1-pro' });
    expect(searched.success && searched.data.flatMap((g) => g.items).map((p) => p.modelKey)).toEqual(['gemini-3.1-pro-preview']);
  });

  it('editing or syncing a price leaves the aliases alone', async () => {
    const row = await rowNamed('gemini-3.1-pro-preview');
    const r = await port.upsert({
      id: row.id,
      modelKey: row.modelKey,
      maker: row.maker,
      billingType: row.billingType,
      rate: { input: { perMToken: 2.5 }, output: { perMToken: 15 } },
    });
    expect(r.success && r.data.price.aliases).toEqual(['gemini-3.1-pro']);
  });
});

describe('list price aliases: the page', () => {
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

  const rowOf = (key: string) =>
    wrapper.findAll('article.price-row').find((r) => r.find('.price-row__name').text() === key)!;

  afterEach(() => wrapper?.unmount());

  it('writes the aliases under the model name', async () => {
    await openGoogle();
    expect(rowOf('gemini-3.1-pro-preview').find('.price-row__aliases').text()).toBe('也叫 gemini-3.1-pro');
    // 没有别名的不写
    expect(rowOf('gemini-2.5-pro').find('.price-row__aliases').exists()).toBe(false);
  });

  it('sets them from the row, and a reader cannot', async () => {
    await openGoogle();
    await rowOf('gemini-2.5-pro').find('.price-row__ops button[title="别名"]').trigger('click');
    await settle();

    const dialog = [...document.body.querySelectorAll<HTMLElement>('.el-dialog')].find((d) => d.textContent?.includes('别名 · gemini-2.5-pro'))!;
    const input = dialog.querySelector<HTMLInputElement>('.el-input-tag input')!;
    input.value = 'gemini-2.5-pro-exp';
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter' }));
    await settle();
    [...dialog.querySelectorAll('button')].find((b) => b.textContent?.trim() === '保存')!.click();
    await settle();

    expect(rowOf('gemini-2.5-pro').find('.price-row__aliases').text()).toBe('也叫 gemini-2.5-pro-exp');
    wrapper.unmount();

    granted.delete('platform.settings.write');
    await openGoogle();
    expect(rowOf('gemini-3.1-pro-preview').find('.price-row__aliases').text()).toBe('也叫 gemini-3.1-pro');
    expect(wrapper.find('button[title="别名"]').exists()).toBe(false);
  });
});
