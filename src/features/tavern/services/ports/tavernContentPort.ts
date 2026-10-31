import type { ItemsEnvelope } from '@/features/tavern/api/http';
import type { AppResult } from '@/shared/api/httpTypes';

import type {
  ActionResult,
  Beat,
  BeatQuery,
  ChronicleEntry,
  ContentQuery,
  MemoryItem,
  MessageRow,
  PageQuery,
  PersonaDetail,
  PersonaRow,
  SessionKey,
  SessionMemory,
  WorldDetail,
  WorldKey,
  WorldRow,
} from '../../model/content.types';

/** 员工看玩家内容：世界、会话、角色卡。删除都是软删，回执给实际动了几行。 */
export interface TavernContentPort {
  worlds(query: ContentQuery, page: PageQuery): Promise<AppResult<ItemsEnvelope<WorldRow>>>;
  world(world: WorldKey): Promise<AppResult<WorldDetail>>;
  chronicle(world: WorldKey, page: PageQuery): Promise<AppResult<ItemsEnvelope<ChronicleEntry>>>;
  beats(world: WorldKey, query: BeatQuery, page: PageQuery): Promise<AppResult<ItemsEnvelope<Beat>>>;
  deleteWorld(world: WorldKey): Promise<AppResult<ActionResult>>;

  /** 第 1 页是最新的一页；页内按 seq 升序。 */
  messages(session: SessionKey, page: PageQuery): Promise<AppResult<ItemsEnvelope<MessageRow>>>;
  deleteMessage(session: SessionKey, messageId: string): Promise<AppResult<ActionResult>>;
  /** 清空会话里的全部消息，`affected` 是清掉的条数。 */
  clearSession(session: SessionKey): Promise<AppResult<ActionResult>>;
  sessionMemory(session: SessionKey): Promise<AppResult<SessionMemory>>;
  memoryItems(session: SessionKey, page: PageQuery): Promise<AppResult<ItemsEnvelope<MemoryItem>>>;
  /** 从召回记忆里拿掉一条，消息本身不动。 */
  forgetMemoryItem(session: SessionKey, messageId: string): Promise<AppResult<ActionResult>>;

  personas(query: ContentQuery, page: PageQuery): Promise<AppResult<ItemsEnvelope<PersonaRow>>>;
  persona(personaId: number): Promise<AppResult<PersonaDetail>>;
  deletePersona(personaId: number): Promise<AppResult<ActionResult>>;
}
