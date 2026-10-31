import { parseTavern, requestTavern, type ItemsEnvelope } from '@/features/tavern/api/http';
import type { TavernContentPort } from '@/features/tavern/services/ports/tavernContentPort';
import type { AppResult } from '@/shared/api/httpTypes';

import {
  actionResultSchema,
  beatSchema,
  chronicleEntrySchema,
  memoryItemSchema,
  messageRowSchema,
  personaDetailSchema,
  personaRowSchema,
  sessionMemorySchema,
  worldDetailSchema,
  worldRowSchema,
  type ActionResult,
  type Beat,
  type BeatQuery,
  type ChronicleEntry,
  type ContentQuery,
  type MemoryItem,
  type MessageRow,
  type PageQuery,
  type PersonaDetail,
  type PersonaRow,
  type SessionKey,
  type SessionMemory,
  type WorldDetail,
  type WorldKey,
  type WorldRow,
} from '../../model/content.types';
import { pageSchema } from '../../model/metering.types';

const BASE = '/tavern/api/admin';

const worldPageSchema = pageSchema(worldRowSchema);
const chroniclePageSchema = pageSchema(chronicleEntrySchema);
const beatPageSchema = pageSchema(beatSchema);
const messagePageSchema = pageSchema(messageRowSchema);
const memoryItemPageSchema = pageSchema(memoryItemSchema);
const personaPageSchema = pageSchema(personaRowSchema);

/** 路径段里的 id 来自服务端，不可能带斜杠，但会话 / 世界 id 还是编一下，免得哪天换了 id 形状悄悄拼错路径。 */
const seg = encodeURIComponent;

const worldPath = ({ accountUid, worldId }: WorldKey) => `${BASE}/accounts/${accountUid}/worlds/${seg(worldId)}`;
const sessionPath = ({ accountUid, sessionId }: SessionKey) => `${BASE}/accounts/${accountUid}/sessions/${seg(sessionId)}`;

export class TavernContentHttpAdapter implements TavernContentPort {
  async worlds(query: ContentQuery, page: PageQuery): Promise<AppResult<ItemsEnvelope<WorldRow>>> {
    const res = await requestTavern<unknown>(`${BASE}/worlds`, { query: { ...page, ...query } });
    return parseTavern(worldPageSchema, res, '世界列表');
  }

  async world(world: WorldKey): Promise<AppResult<WorldDetail>> {
    return parseTavern(worldDetailSchema, await requestTavern<unknown>(worldPath(world)), '世界详情');
  }

  async chronicle(world: WorldKey, page: PageQuery): Promise<AppResult<ItemsEnvelope<ChronicleEntry>>> {
    const res = await requestTavern<unknown>(`${worldPath(world)}/chronicle`, { query: page });
    return parseTavern(chroniclePageSchema, res, '纪事');
  }

  async beats(world: WorldKey, query: BeatQuery, page: PageQuery): Promise<AppResult<ItemsEnvelope<Beat>>> {
    const res = await requestTavern<unknown>(`${worldPath(world)}/beats`, { query: { ...page, ...query } });
    return parseTavern(beatPageSchema, res, '心理节拍');
  }

  async deleteWorld(world: WorldKey): Promise<AppResult<ActionResult>> {
    const res = await requestTavern<unknown>(worldPath(world), { method: 'DELETE' });
    return parseTavern(actionResultSchema, res, '删除世界');
  }

  async messages(session: SessionKey, page: PageQuery): Promise<AppResult<ItemsEnvelope<MessageRow>>> {
    const res = await requestTavern<unknown>(`${sessionPath(session)}/messages`, { query: page });
    return parseTavern(messagePageSchema, res, '消息');
  }

  async deleteMessage(session: SessionKey, messageId: string): Promise<AppResult<ActionResult>> {
    const res = await requestTavern<unknown>(`${sessionPath(session)}/messages/${seg(messageId)}`, { method: 'DELETE' });
    return parseTavern(actionResultSchema, res, '删除消息');
  }

  async clearSession(session: SessionKey): Promise<AppResult<ActionResult>> {
    const res = await requestTavern<unknown>(`${sessionPath(session)}/clear`, { method: 'POST' });
    return parseTavern(actionResultSchema, res, '清空会话');
  }

  async sessionMemory(session: SessionKey): Promise<AppResult<SessionMemory>> {
    return parseTavern(sessionMemorySchema, await requestTavern<unknown>(`${sessionPath(session)}/memory`), '会话记忆');
  }

  async memoryItems(session: SessionKey, page: PageQuery): Promise<AppResult<ItemsEnvelope<MemoryItem>>> {
    const res = await requestTavern<unknown>(`${sessionPath(session)}/memory/items`, { query: page });
    return parseTavern(memoryItemPageSchema, res, '召回记忆');
  }

  async forgetMemoryItem(session: SessionKey, messageId: string): Promise<AppResult<ActionResult>> {
    const res = await requestTavern<unknown>(`${sessionPath(session)}/memory/items/${seg(messageId)}`, { method: 'DELETE' });
    return parseTavern(actionResultSchema, res, '遗忘记忆');
  }

  async personas(query: ContentQuery, page: PageQuery): Promise<AppResult<ItemsEnvelope<PersonaRow>>> {
    const res = await requestTavern<unknown>(`${BASE}/personas`, { query: { ...page, ...query } });
    return parseTavern(personaPageSchema, res, '角色卡列表');
  }

  async persona(personaId: number): Promise<AppResult<PersonaDetail>> {
    return parseTavern(personaDetailSchema, await requestTavern<unknown>(`${BASE}/personas/${personaId}`), '角色卡详情');
  }

  async deletePersona(personaId: number): Promise<AppResult<ActionResult>> {
    const res = await requestTavern<unknown>(`${BASE}/personas/${personaId}`, { method: 'DELETE' });
    return parseTavern(actionResultSchema, res, '删除角色卡');
  }
}
