import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { usageLineSchema, type UsageLine, type UsageLog } from '../model/jastalk.types';
import { dueAmount, groupUsageActions, mainCall } from '../model/usageActions';

/**
 * 用量明细按一件事看：一件事背后有好几次调用，各扣各的，加起来是这件事的数
 * （2026-11-21 用户：「我们是对话或者唤醒，是调用链，会完成 N 次调用」）。
 * 页面上不摆调用链、不摆会话，只摆查账用得上的和扣积分的依据（同一天用户：「调用链 不用展示……会话有鸡毛用吗？」）。
 */

function line(kind: string, points: number, over: Partial<UsageLine> = {}): UsageLine {
  return usageLineSchema.parse({
    kind,
    vendorKey: kind === 'chat' ? 'kiro' : 'media',
    modelName: kind === 'chat' ? 'claude-opus-5.5' : 'BAAI/bge-m3',
    unit: 'token',
    inputTokens: 100,
    outputTokens: 0,
    quantity: 0,
    estimated: false,
    ratedBy: 'x/y',
    inputPrice: 1,
    outputPrice: 1,
    points,
    ...over,
  });
}

function settlement(id: number, actionId: string, at: number, lines: UsageLine[], over: Partial<UsageLog> = {}): UsageLog {
  const amount = Math.round(lines.reduce((s, l) => s + l.points, 0) * 100) / 100;
  return {
    id,
    accountUid: 100200,
    actionId,
    purpose: 'chat',
    conversationId: null,
    traceId: null,
    status: amount > 0 ? 'charged' : 'voided',
    upstreamSuccess: true,
    lines,
    amount,
    createdAt: at,
    ...over,
  };
}

describe('grouping settlements into one action per call chain', () => {
  const logs: UsageLog[] = [
    // 后端按时间倒序回，同一件事的几次结算夹在别的事中间
    settlement(5, 'a-2', 9_000, [line('chat', 3)], { purpose: 'proactive', conversationId: 'c:linjia' }),
    settlement(4, 'a-1', 7_000, [line('speech', 0, { unit: 'audio_second' })], { upstreamSuccess: false }),
    settlement(3, 'a-1', 3_000, [line('chat', 2.5)], { conversationId: 'c:xiaoman' }),
    settlement(2, 'a-1', 1_000, [line('rerank', 0.2)]),
    settlement(1, 'a-1', 0, [line('embedding', 0.05)]),
    settlement(6, 'a-3', -500, [line('chat', 0)], { upstreamSuccess: false }),
  ];
  const actions = groupUsageActions(logs);

  it('one row per action, newest first, its calls in the order they ran', () => {
    expect(actions.map((a) => a.actionId)).toEqual(['a-2', 'a-1', 'a-3']);
    const a1 = actions[1]!;
    expect(a1.calls.map((c) => [c.step, c.line.kind])).toEqual([
      [1, 'embedding'],
      [2, 'rerank'],
      [3, 'chat'],
      [4, 'speech'],
    ]);
    expect(a1.at).toBe(0);
    expect(a1.conversationId).toBe('c:xiaoman');
  });

  it('adds up what the whole chain charged, and keeps each call with its own outcome', () => {
    const a1 = actions[1]!;
    expect(a1.amount).toBe(2.75);
    expect(a1.status).toBe('charged');
    expect(a1.calls.map((c) => c.upstreamSuccess)).toEqual([true, true, true, false]);
    expect(dueAmount(a1)).toBe(2.75);
    // 什么都没产出的一件事：未扣
    expect(actions[2]!.status).toBe('voided');
  });

  it('names the chat model as the one that matters', () => {
    const twoTurns = groupUsageActions([
      settlement(1, 'a', 0, [line('embedding', 0.1)]),
      settlement(2, 'a', 1, [line('chat', 1)]),
      settlement(3, 'a', 2, [line('chat', 2)]),
    ])[0]!;
    expect(mainCall(twoTurns)?.step).toBe(3);
  });
});

// ─── 页面 ────────────────────────────────────────────────

function useFreshMock(): void {
  vi.resetModules();
  vi.doMock('../services', async () => {
    const { JastalkAdminMock } = await import('../services/mock/jastalkAdminMock');
    const port = new JastalkAdminMock();
    return { getJastalkAdminPort: () => port };
  });
}

let wrapper: VueWrapper;

async function settle(ms = 400): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
  await flushPromises();
  await flushPromises();
}

const clean = (s: string | null | undefined): string => (s ?? '').replace(/\s+/g, ' ').trim();

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

describe('jastalk usage page', () => {
  async function open(): Promise<void> {
    const mod = await import('../views/JastalkUsageLogsView.vue');
    wrapper = mount(mod.default, { global: { plugins: [ElementPlus] }, attachTo: document.body });
    await settle();
  }

  const rows = () => wrapper.findAll('.el-table__body tbody tr');

  /** 一行一行点开，找到第一件对话命中了缓存的事，回它的扣费明细。 */
  async function openCachedChat(): Promise<HTMLElement> {
    for (let i = 0; i < rows().length; i++) {
      await rows()[i]!.find('td').trigger('click');
      await settle(150);
      const drawer = [...document.body.querySelectorAll<HTMLElement>('.el-drawer')].at(-1)!;
      const chat = [...drawer.querySelectorAll<HTMLElement>('.call')].find((c) => clean(c.querySelector('.call__kind')?.textContent) === '对话');
      if (chat && [...chat.querySelectorAll('.dim-label')].some((l) => l.textContent === '缓存')) return drawer;
      (drawer.querySelector('.el-drawer__close-btn') as HTMLElement | null)?.click();
      await settle(150);
    }
    throw new Error('mock 里没有命中缓存的对话');
  }

  it('lists only what an audit needs: when, who, what, which model, how many points — no call chain, no conversation', async () => {
    await open();

    const headers = [...new Set(wrapper.findAll('.el-table__header th').map((th) => th.text().trim()))].filter(Boolean);
    expect(headers).toEqual(['时间', '账户', '功能', '模型', '积分']);

    expect(rows().length).toBe(20);
    expect(wrapper.find('.chain').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('→');
    // 模型那一格写的是「渠道 / 模型」
    expect(rows().some((r) => /\w+ \/ [\w.-]+/.test(r.text()))).toBe(true);
  });

  it('opens the basis of the points: each call worked out as usage × unit price, and where the price came from', async () => {
    await open();
    const drawer = await openCachedChat();

    expect(drawer.querySelector('.el-drawer__title')?.textContent).toBe('扣费明细');
    // 查账用不上的不摆
    for (const word of ['调用链', '会话', '这件事', 'TraceId', '出错', '上游']) expect(drawer.textContent).not.toContain(word);
    expect(drawer.querySelector('.call__step')).toBeNull();
    expect([...drawer.querySelectorAll('.el-descriptions__label')].map((l) => clean(l.textContent))).toEqual(['发生时间', '账户', '功能', '扣积分']);

    // 对话那一次：输入、缓存、输出一档一行，用量 × 单价 = 积分，下面是单价的来历
    const chat = [...drawer.querySelectorAll<HTMLElement>('.call')].find((c) => clean(c.querySelector('.call__kind')?.textContent) === '对话')!;
    expect([...chat.querySelectorAll('.dim-label')].map((l) => l.textContent)).toEqual(['输入', '缓存', '输出']);
    expect(clean(chat.querySelector('.call__basis')?.textContent)).toMatch(/^跟随渠道：牌价 /);
  });

  it('says an action charged nothing when no call in it produced anything', async () => {
    await open();
    // 筛「结果：未扣」
    await wrapper.findAll('.filters .el-select')[1]!.find('.el-select__wrapper').trigger('click');
    await settle(100);
    const option = [...document.body.querySelectorAll<HTMLElement>('.el-select-dropdown__item')].find((o) => o.textContent?.trim() === '未扣')!;
    option.click();
    await settle();
    expect(rows().length).toBeGreaterThan(0);
    expect(rows().every((r) => r.text().includes('未扣'))).toBe(true);
    const index = 0;
    expect(index).toBeGreaterThanOrEqual(0);
    await rows()[index]!.find('td').trigger('click');
    await settle(200);
    const drawer = document.body.querySelector<HTMLElement>('.el-drawer')!;
    expect(drawer.textContent).toContain('未扣 · 没有产出，冻结整笔退回');
  });
});
