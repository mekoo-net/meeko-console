import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ok } from '@/shared/api/httpTypes';
import * as http from '@/features/tavern/api/http';

import { TavernContentHttpAdapter } from '../api/adapters/tavernContentAdapter';

// 只替换传输，parseTavern 用真的：解析正是要测的东西。
vi.mock('@/features/tavern/api/http', async (importOriginal) => ({
  ...(await importOriginal<typeof http>()),
  requestTavern: vi.fn(),
}));

const request = vi.mocked(http.requestTavern);

/**
 * 钉住内容管理接口「后端真发什么」：camelCase、snake_case 枚举、epoch 毫秒，世界书 / 规则书 / 预设是内嵌的 JSON 文档。
 */

const ACCOUNT = { uid: 100002333, displayName: '林夏', email: 'linxia@example.com', phone: null };
const WORLD_ID = 'b3c1f0a2-6d4e-4f7a-9c21-5e8d7a6b4c10';
const DM_ID = '23c97d30-c8a6-4920-bd78-4c244bac6328';
const WORLD = { accountUid: 100002333, worldId: WORLD_ID };
const DM = { accountUid: 100002333, sessionId: DM_ID };
const FIRST_PAGE = { p: 1, pageSize: 20 };

function wireWorld(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: WORLD_ID,
    account: ACCOUNT,
    title: '雾港谜案',
    stats: { members: 3, sessions: 6, messages: 412 },
    createdAt: 1758600000000,
    updatedAt: 1761877649000,
    lastActiveAt: 1761877649000,
    deletedAt: null,
    ...overrides,
  };
}

const persona = { id: 10000008, name: '沈惟行', avatar: null };

function wireDetail(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    world: wireWorld(),
    settings: {
      preset: { systemPrompt: '你是雾港世界的叙述者。', style: 'noir' },
      completion: { temperature: 0.9 },
      pipelineModels: null,
    },
    worldBook: {
      version: 7,
      updatedAt: 1761700000000,
      document: {
        version: 3,
        nodes: [
          { id: 'geo', type: 'group', title: '地理' },
          {
            id: 'dock3',
            type: 'lore',
            parent: 'geo',
            title: '三号码头',
            content: '夜里只有一盏灯。',
            activation: { mode: 'keyword', keywords: ['码头'], scanDepth: 3 },
            // 文档里多出来的键放行，不让整页打不开。
            futureFlag: true,
          },
        ],
      },
    },
    rulebook: {
      version: 4,
      updatedAt: 1761400000000,
      document: {
        variables: [
          { key: 'case_stage', scope: 'world', type: 'enum', values: ['open', 'solved'], default: 'open' },
          { key: 'trust', scope: 'character', type: 'int', min: 0, max: 100, default: 50, actorAdjust: 10 },
        ],
        rules: [
          {
            id: 'morning_tea',
            on: { clock: '08:30', days: ['mon'] },
            if: 'a.trust >= 60',
            do: [{ wake: { who: 'a', intent: '去茶馆' } }],
            with: { a: 10000008 },
          },
        ],
      },
    },
    members: [{ persona, displayOrder: 0, joinedAt: 1758600000000, leftAt: null, dmSessionId: DM_ID }],
    sessions: [
      {
        id: DM_ID,
        kind: 'dm',
        name: '沈惟行',
        messages: 46,
        lastActiveAt: 1761877649000,
        createdAt: 1758600000000,
        deletedAt: null,
      },
    ],
    runtime: {
      overview: '雾港，三月。',
      storyClockIso: '2026-03-14T21:40:00',
      events: [{ id: 'e1', atIso: '2026-03-15T02:00:00', title: '码头夜间卸货', note: null }],
      places: [],
      variables: [
        { name: 'case_stage', values: [{ persona: null, value: 'suspect' }] },
        { name: 'trust', values: [{ persona, value: '72' }] },
      ],
    },
    ...overrides,
  };
}

describe('tavern content adapters', () => {
  beforeEach(() => {
    request.mockReset();
  });

  it('pages worlds with p / pageSize and the lifecycle state', async () => {
    request.mockResolvedValueOnce(
      ok({ items: [wireWorld(), wireWorld({ id: 'x', deletedAt: 1761800000000, lastActiveAt: null })], total: 2, page: 1, pageSize: 20 }),
    );
    const r = await new TavernContentHttpAdapter().worlds({ accountUid: 100002333, state: 'all' }, FIRST_PAGE);
    expect(request).toHaveBeenCalledWith('/tavern/api/admin/worlds', {
      query: { p: 1, pageSize: 20, accountUid: 100002333, state: 'all' },
    });
    if (!r.success) throw new Error(r.error.message);
    expect(r.data.total).toBe(2);
    expect(r.data.items[0]?.account.displayName).toBe('林夏');
    expect(r.data.items[1]).toMatchObject({ deletedAt: 1761800000000, lastActiveAt: null });
  });

  it('reads a world detail with its embedded documents, keeping unknown document keys', async () => {
    request.mockResolvedValueOnce(ok(wireDetail()));
    const r = await new TavernContentHttpAdapter().world(WORLD);
    expect(request).toHaveBeenCalledWith(`/tavern/api/admin/accounts/100002333/worlds/${WORLD_ID}`);
    if (!r.success) throw new Error(r.error.message);
    const d = r.data;
    expect(d.settings.preset.systemPrompt).toBe('你是雾港世界的叙述者。');
    expect(d.worldBook?.document.nodes.map((n) => n.type)).toEqual(['group', 'lore']);
    expect(d.worldBook?.document.nodes[1]).toMatchObject({ parent: 'geo', futureFlag: true });
    expect(d.sessions[0]).toMatchObject({ kind: 'dm', name: '沈惟行' });
    expect(d.runtime?.variables[1]?.values[0]).toEqual({ persona, value: '72' });
  });

  it('fills the defaults a stored document leaves out and tags each shape it can take', async () => {
    request.mockResolvedValueOnce(ok(wireDetail()));
    const r = await new TavernContentHttpAdapter().world(WORLD);
    if (!r.success) throw new Error(r.error.message);
    const [group, lore] = r.data.worldBook?.document.nodes ?? [];
    expect(group).toMatchObject({ type: 'group', enabled: true, order: 0, audience: 'all' });
    expect(lore?.type === 'lore' && lore.probability).toBe(100);
    expect(lore?.type === 'lore' && lore.activation).toMatchObject({ mode: 'keyword', match: 'any', scanDepth: 3, also: [] });

    const rulebook = r.data.rulebook?.document;
    expect(rulebook?.variables.map((v) => v.type)).toEqual(['enum', 'int']);
    expect(rulebook?.rules[0]).toMatchObject({ enabled: true, priority: 0, once: false });
    expect(rulebook?.rules[0]?.on).toMatchObject({ kind: 'clock', clock: '08:30', days: ['mon'] });
  });

  it('reads a world that never ran and has no world book or rulebook', async () => {
    request.mockResolvedValueOnce(ok(wireDetail({ worldBook: null, rulebook: null, runtime: null, members: [], sessions: [] })));
    const r = await new TavernContentHttpAdapter().world(WORLD);
    if (!r.success) throw new Error(r.error.message);
    expect(r.data.worldBook).toBeNull();
    expect(r.data.runtime).toBeNull();
  });

  it('rejects a preset that comes down as a JSON string instead of an embedded document', async () => {
    const detail = wireDetail();
    const settings = { ...(detail.settings as object), preset: '{"systemPrompt":"x"}' };
    request.mockResolvedValueOnce(ok({ ...detail, settings }));
    const r = await new TavernContentHttpAdapter().world(WORLD);
    expect(r.success).toBe(false);
    expect(!r.success && r.error.code).toBe('validation');
  });

  it('reads a page of messages with text segments and an image', async () => {
    const base = { role: 'assistant', source: 'assistant', status: 'completed', memory: true, createdAt: 1, updatedAt: 1, deletedAt: null };
    request.mockResolvedValueOnce(
      ok({
        items: [
          {
            ...base,
            id: 'm1',
            seq: 41,
            content: {
              kind: 'text',
              storyAt: '2026-03-14T21:12:00',
              segments: [
                { speaker: '苏晚', said: '“来啦？”', inner: '沈督察怎么也来了。' },
                { speaker: '沈惟行', said: '他坐下了。', inner: null },
              ],
            },
          },
          {
            ...base,
            id: 'm2',
            seq: 42,
            role: 'user',
            source: 'user',
            memory: false,
            content: {
              kind: 'image',
              storyAt: null,
              image: { storageKey: 'tavern/u1/img/a.webp', width: 1024, height: null, mime: 'image/webp' },
            },
          },
        ],
        total: 42,
        page: 1,
        pageSize: 20,
      }),
    );
    const r = await new TavernContentHttpAdapter().messages(DM, FIRST_PAGE);
    expect(request).toHaveBeenCalledWith(`/tavern/api/admin/accounts/100002333/sessions/${DM_ID}/messages`, {
      query: { p: 1, pageSize: 20 },
    });
    if (!r.success) throw new Error(r.error.message);
    const [text, image] = r.data.items;
    expect(text?.content.kind === 'text' && text.content.segments.map((s) => s.speaker)).toEqual(['苏晚', '沈惟行']);
    expect(text?.content.kind === 'text' && text.content.segments[0]?.inner).toBe('沈督察怎么也来了。');
    expect(image?.content.kind === 'image' && image.content.image.height).toBeNull();
  });

  it('clears a session with POST and reads the affected count', async () => {
    request.mockResolvedValueOnce(ok({ affected: 46 }));
    const r = await new TavernContentHttpAdapter().clearSession(DM);
    expect(request).toHaveBeenCalledWith(`/tavern/api/admin/accounts/100002333/sessions/${DM_ID}/clear`, { method: 'POST' });
    expect(r).toEqual(ok({ affected: 46 }));
  });

  it('deletes a persona by its numeric id', async () => {
    request.mockResolvedValueOnce(ok({ affected: 1 }));
    const r = await new TavernContentHttpAdapter().deletePersona(10000008);
    expect(request).toHaveBeenCalledWith('/tavern/api/admin/personas/10000008', { method: 'DELETE' });
    expect(r.success && r.data.affected).toBe(1);
  });

  it('turns a message with an unknown content kind into a validation failure', async () => {
    request.mockResolvedValueOnce(
      ok({
        items: [
          {
            id: 'm1',
            seq: 1,
            role: 'assistant',
            source: 'assistant',
            status: 'completed',
            content: { kind: 'audio', storyAt: null },
            memory: false,
            createdAt: 1,
            updatedAt: 1,
            deletedAt: null,
          },
        ],
        total: 1,
        page: 1,
        pageSize: 20,
      }),
    );
    const r = await new TavernContentHttpAdapter().messages(DM, FIRST_PAGE);
    expect(!r.success && r.error.code).toBe('validation');
  });
});
