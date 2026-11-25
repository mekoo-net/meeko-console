import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { failureText } from '../model/ratecard';
import { OneApiRatecardMock, _resetOneApiRatecardMock } from '../services/mock/oneapiRatecardMock';
import RatecardView from '../views/RatecardView.vue';

/**
 * 上游同步删上游已经不列的模型：只删从那个目录来的行。
 * 2026-11-25 用户：「上游删除的时候删除的只能是 来自渠道的 手动不应该删除」。
 * 手动的（人录的、拉下来以后人改过的）上游有没有它都不删；有映射指向的列出来但不删——映射是人建的。
 * 种子里 gemini-2.0-flash 是以前从 models.dev 同步来、上游现在不列的那一行。
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

async function goneKeys(maker: string | null = null): Promise<string[]> {
  const r = await port.fetchCandidates({ maker });
  if (!r.success) throw new Error('fetch failed');
  return (r.data.gone ?? []).map((g) => g.current.modelKey);
}

describe('upstream sync removes only what came from upstream: the rules', () => {
  it('lists a synced row the catalogue dropped, never a manual one', async () => {
    expect(await goneKeys()).toEqual(['gemini-2.0-flash']);
    expect(await goneKeys('openai')).toEqual([]);

    // 人改过价的就算手动：同步不再管它
    const row = await rowNamed('gemini-2.0-flash');
    await port.upsert({ id: row.id, modelKey: row.modelKey, maker: row.maker, billingType: row.billingType, rate: row.rate });
    expect(await goneKeys()).toEqual([]);
  });

  it('applying removes the picked row, and refuses a manual or a mapped one', async () => {
    const manual = await rowNamed('acme-search');
    const refused = await port.applyCandidates([], [manual.id]);
    expect(!refused.success && failureText(refused.error)).toContain('manual');

    const dropped = await rowNamed('gemini-2.0-flash');
    await port.saveMapping({ modelKey: 'gemini-flash-old', targetId: dropped.id });
    const fetched = await port.fetchCandidates({ maker: 'google' });
    expect(fetched.success && fetched.data.gone).toEqual([expect.objectContaining({ mappedBy: ['gemini-flash-old'] })]);
    const mapped = await port.applyCandidates([], [dropped.id]);
    expect(!mapped.success && failureText(mapped.error)).toContain('map to it');

    const mapping = (await port.listByMaker({ keyword: '' }));
    const id = mapping.success ? mapping.data.flatMap((g) => g.mappings ?? []).find((m) => m.modelKey === 'gemini-flash-old')!.id : '';
    await port.removeMapping(id);
    const applied = await port.applyCandidates([], [dropped.id]);
    expect(applied.success && applied.data).toMatchObject({ added: 0, updated: 0, removed: 1, publish: { written: ['google'] } });
  });
});

describe('upstream sync removes only what came from upstream: the page', () => {
  let wrapper: VueWrapper;

  async function settle(): Promise<void> {
    await flushPromises();
    await flushPromises();
  }

  function openDialog(): HTMLElement {
    const open = [...document.body.querySelectorAll<HTMLElement>('.el-dialog')].filter(
      (d) => d.closest<HTMLElement>('.el-overlay')?.style.display !== 'none',
    );
    expect(open).toHaveLength(1);
    return open[0]!;
  }

  afterEach(() => wrapper?.unmount());

  async function syncGoogle(): Promise<HTMLElement> {
    wrapper = mount(RatecardView, { global: { plugins: [ElementPlus] }, attachTo: document.body });
    await settle();
    await wrapper.findAll('.maker-item').find((m) => m.text().includes('Google'))!.trigger('click');
    await settle();
    await wrapper.findAll('button').find((b) => b.text().trim() === '上游同步')!.trigger('click');
    await settle();
    return openDialog();
  }

  const keyCells = (dialog: HTMLElement) =>
    [...dialog.querySelectorAll('.col-key')].map((td) => td.textContent?.replace(/\s+/g, ''));

  it('shows the dropped row ticked, and applying deletes it', async () => {
    const dialog = await syncGoogle();
    expect(keyCells(dialog)).toEqual(['gemini-2.5-flash-lite新增', 'gemini-2.0-flash上游已删']);
    expect(dialog.querySelectorAll('.diff-row--picked')).toHaveLength(2);
    expect(dialog.querySelector('.diff-row--gone .col-note')?.textContent).toContain('套用时删掉');

    [...dialog.querySelectorAll('button')].find((b) => b.textContent?.trim() === '套用 2 条')!.click();
    await settle();
    const names = wrapper.findAll('.price-row__name').map((n) => n.text());
    expect(names).toContain('gemini-2.5-flash-lite');
    expect(names).not.toContain('gemini-2.0-flash');
    expect(document.body.querySelector('.el-message')?.textContent).toContain('删除 1 条');
  });

  it('a dropped row that a mapping points to is listed but cannot be ticked', async () => {
    const dropped = await rowNamed('gemini-2.0-flash');
    await port.saveMapping({ modelKey: 'gemini-flash-old', targetId: dropped.id });
    const dialog = await syncGoogle();
    const gone = dialog.querySelector<HTMLElement>('.diff-row--gone')!;
    expect(gone.classList.contains('diff-row--picked')).toBe(false);
    expect(gone.querySelector('input[type="checkbox"]')?.hasAttribute('disabled')).toBe(true);
    expect(gone.querySelector('.col-note')?.textContent).toContain('有映射指向它（gemini-flash-old），不删');
  });
});
