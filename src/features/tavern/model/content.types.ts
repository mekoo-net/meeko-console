import { z } from 'zod';

import { epochMillisNullableSchema, epochMillisSchema } from '@/shared/lib/epoch';

import type { StatusTone } from './metering.types';

/**
 * Tavern 内容管理（世界 / 会话 / 角色卡）的后台契约，wire camelCase、枚举 snake_case、时间 epoch 毫秒。
 * 世界 / 会话按账户寻址（`/accounts/{uid}/...`），角色卡 id 全局唯一，直接按 id 寻址。
 *
 * 世界书、规则书、预设这些是玩家（和导演）写进库里的 JSON 文档，原样下发、后台只展示：
 * 写入时服务端已整份校验过，这里只钉住页面要读的字段、补上文档省略时的默认值，其余键放行，免得文档多一个字段整页打不开。
 */

// ---------- JSON 文档 ----------

/** 不透明的 JSON 值：后台只原样展示，不解释形状。 */
export const jsonValueSchema = z.unknown();

export const jsonObjectSchema = z.record(z.string(), jsonValueSchema);
export type JsonObject = z.infer<typeof jsonObjectSchema>;

/**
 * 内嵌的 JSON 文档：对象或数组。jsonb 列被当字符串再编码一遍下发时，这里会直接校验失败，
 * 而不是在页面上把一整段转义过的字符串当文档显示。
 */
export const jsonDocumentSchema = z.union([jsonObjectSchema, z.array(jsonValueSchema)]);
export type JsonDocument = z.infer<typeof jsonDocumentSchema>;

/** 叙事预设 / 人设：`systemPrompt` 是一大段正文，页面单独按原文排一份，其余整份看 JSON。 */
export const presetSchema = z.looseObject({ systemPrompt: z.string().nullish() });
export type Preset = z.infer<typeof presetSchema>;

// ---------- 寻址与查询 ----------

export interface WorldKey {
  accountUid: number;
  worldId: string;
}

export interface SessionKey {
  accountUid: number;
  sessionId: string;
}

// 查询参数原样进 query string，所以是 type 而不是 interface：interface 不能当 Record 传。

/** 与 Yomi 管理列表同：`p` 从 1 起。 */
export type PageQuery = {
  p: number;
  pageSize: number;
};

/** 世界 / 角色卡列表的筛选；`keyword` 对世界是标题、对角色卡是名字。 */
export type ContentQuery = {
  accountUid?: number;
  keyword?: string;
  state: LifecycleState;
};

export type BeatQuery = {
  /** 只看这个角色；省略为全部。 */
  personaId?: number;
};

// ---------- 引用 ----------

/** 账户只带展示用的几项；详情去平台账户页看。 */
export const accountRefSchema = z.object({
  uid: z.number().int(),
  displayName: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
});
export type AccountRef = z.infer<typeof accountRefSchema>;

export const personaRefSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  avatar: z.string().nullable(),
});
export type PersonaRef = z.infer<typeof personaRefSchema>;

/** 删除 / 清空 / 遗忘的回执：实际动了几行。被拒走信封错误，不在这里。 */
export const actionResultSchema = z.object({ affected: z.number().int().nonnegative() });
export type ActionResult = z.infer<typeof actionResultSchema>;

// ---------- 生命周期（软删除） ----------

/** 列表的 `state` 参数：服务端默认只列没删的。 */
export const lifecycleStateSchema = z.enum(['live', 'deleted', 'all']);
export type LifecycleState = z.infer<typeof lifecycleStateSchema>;
export const lifecycleStateValues = lifecycleStateSchema.options;

export const LifecycleStateLabel: Readonly<Record<LifecycleState, string>> = {
  live: '正常',
  deleted: '已删除',
  all: '全部',
};

export const LifecycleStateTone: Readonly<Record<Exclude<LifecycleState, 'all'>, StatusTone>> = {
  live: 'success',
  deleted: 'info',
};

// ---------- 会话 ----------

export const sessionKindSchema = z.enum(['dm', 'world', 'private_group', 'system', 'scene']);
export type SessionKind = z.infer<typeof sessionKindSchema>;

export const SessionKindLabel: Readonly<Record<SessionKind, string>> = {
  dm: '私聊',
  world: '新闻墙',
  private_group: '群聊',
  system: '导演席',
  scene: '场景',
};

export const SessionKindTone: Readonly<Record<SessionKind, StatusTone | 'primary'>> = {
  dm: 'primary',
  world: 'warning',
  private_group: 'success',
  system: 'danger',
  scene: 'info',
};

export const sessionRowSchema = z.object({
  id: z.string().min(1),
  kind: sessionKindSchema,
  /** 私聊是演员的名字，频道是标题；没起标题的规范频道（新闻墙、导演席）为 null，按种类叫。 */
  name: z.string().nullable(),
  messages: z.number().int().nonnegative(),
  lastActiveAt: epochMillisSchema,
  createdAt: epochMillisSchema,
  deletedAt: epochMillisNullableSchema,
});
export type SessionRow = z.infer<typeof sessionRowSchema>;

// ---------- 世界 ----------

export const worldStatsSchema = z.object({
  members: z.number().int().nonnegative(),
  sessions: z.number().int().nonnegative(),
  messages: z.number().int().nonnegative(),
});
export type WorldStats = z.infer<typeof worldStatsSchema>;

export const worldRowSchema = z.object({
  id: z.string().min(1),
  account: accountRefSchema,
  title: z.string(),
  stats: worldStatsSchema,
  createdAt: epochMillisSchema,
  updatedAt: epochMillisSchema,
  /** 从没有人说过话为 null。 */
  lastActiveAt: epochMillisNullableSchema,
  deletedAt: epochMillisNullableSchema,
});
export type WorldRow = z.infer<typeof worldRowSchema>;

/** 叙事预设、补全参数、管线模型：玩家端写的，后台原样看。 */
export const worldSettingsSchema = z.object({
  preset: presetSchema,
  completion: jsonDocumentSchema.nullable(),
  pipelineModels: jsonDocumentSchema.nullable(),
});
export type WorldSettings = z.infer<typeof worldSettingsSchema>;

// ----- 世界书（WORLDBOOK.md §2） -----

export const worldBookNodeTypeSchema = z.enum(['group', 'lore']);
export type WorldBookNodeType = z.infer<typeof worldBookNodeTypeSchema>;

export const WorldBookNodeTypeLabel: Readonly<Record<WorldBookNodeType, string>> = {
  group: '分组',
  lore: '设定',
};

export const WorldBookNodeTypeTone: Readonly<Record<WorldBookNodeType, 'primary' | 'success'>> = {
  group: 'primary',
  lore: 'success',
};

export const worldBookAudienceSchema = z.enum(['all', 'director', 'actors']);
export type WorldBookAudience = z.infer<typeof worldBookAudienceSchema>;

export const WorldBookAudienceLabel: Readonly<Record<WorldBookAudience, string>> = {
  all: '所有人',
  director: '仅导演',
  actors: '仅演员',
};

export const activationModeSchema = z.enum(['always', 'keyword', 'semantic']);
export type ActivationMode = z.infer<typeof activationModeSchema>;

export const ActivationModeLabel: Readonly<Record<ActivationMode, string>> = {
  always: '常驻',
  keyword: '关键词',
  semantic: '语义召回',
};

export const keywordMatchSchema = z.enum(['any', 'all']);
export type KeywordMatch = z.infer<typeof keywordMatchSchema>;

export const KeywordMatchLabel: Readonly<Record<KeywordMatch, string>> = {
  any: '任一命中',
  all: '全部命中',
};

export const worldBookActivationSchema = z.looseObject({
  mode: activationModeSchema.default('always'),
  keywords: z.array(z.string()).default([]),
  also: z.array(z.string()).default([]),
  match: keywordMatchSchema.default('any'),
  scanDepth: z.number().int().default(2),
  regex: z.boolean().default(false),
  caseSensitive: z.boolean().default(false),
});
export type WorldBookActivation = z.infer<typeof worldBookActivationSchema>;

const worldBookNodeBase = {
  id: z.string().min(1),
  parent: z.string().nullish(),
  title: z.string().nullish(),
  enabled: z.boolean().default(true),
  order: z.number().int().default(0),
  when: z.string().nullish(),
  audience: worldBookAudienceSchema.default('all'),
};

/** 节点平铺成一个数组，用 `parent` 连成树；分组是文件夹，只有设定带正文和触发方式。 */
export const worldBookNodeSchema = z.discriminatedUnion('type', [
  z.looseObject({ ...worldBookNodeBase, type: z.literal('group') }),
  z.looseObject({
    ...worldBookNodeBase,
    type: z.literal('lore'),
    content: z.string().nullish(),
    activation: worldBookActivationSchema.default(() => worldBookActivationSchema.parse({})),
    probability: z.number().default(100),
  }),
]);
export type WorldBookNode = z.infer<typeof worldBookNodeSchema>;
export type WorldBookLore = Extract<WorldBookNode, { type: 'lore' }>;

export const worldBookDocumentSchema = z.looseObject({
  version: z.number().int().optional(),
  nodes: z.array(worldBookNodeSchema),
});
export type WorldBookDocument = z.infer<typeof worldBookDocumentSchema>;

export const worldBookSchema = z.object({
  /** 行版本（CAS），与文档里的 `version` 不是一回事。 */
  version: z.number().int(),
  document: worldBookDocumentSchema,
  updatedAt: epochMillisSchema,
});
export type WorldBook = z.infer<typeof worldBookSchema>;

// ----- 规则书（RULES.md §2–3） -----

export const ruleScopeSchema = z.enum(['world', 'character']);
export type RuleScope = z.infer<typeof ruleScopeSchema>;

export const RuleScopeLabel: Readonly<Record<RuleScope, string>> = {
  world: '世界',
  character: '角色',
};

const ruleVariableBase = {
  key: z.string().min(1),
  scope: ruleScopeSchema,
  label: z.string().nullish(),
  default: jsonValueSchema.optional(),
  visible: z.boolean().default(true),
};

/** 变量按 `type` 是不同的形状：整数有范围，枚举有取值，状态机有状态。 */
export const ruleVariableSchema = z.discriminatedUnion('type', [
  z.looseObject({ ...ruleVariableBase, type: z.literal('int'), min: z.number().nullish(), max: z.number().nullish() }),
  z.looseObject({ ...ruleVariableBase, type: z.literal('bool') }),
  z.looseObject({ ...ruleVariableBase, type: z.literal('enum'), values: z.array(z.string()).default([]) }),
  z.looseObject({ ...ruleVariableBase, type: z.literal('state'), states: z.array(z.string()).default([]) }),
]);
export type RuleVariable = z.infer<typeof ruleVariableSchema>;

export const RuleVariableTypeLabel: Readonly<Record<RuleVariable['type'], string>> = {
  int: '整数',
  bool: '布尔',
  enum: '枚举',
  state: '状态机',
};

/**
 * 触发源三选一：变量变化 / 世界事件 / 故事钟（`clock` + 可选 `days`）。文档里没有判别字段，
 * 读进来时按形状补一个 `kind`，后面按它分派。
 */
export const ruleTriggerSchema = z.union([
  z.looseObject({ change: z.string() }).transform((t) => ({ ...t, kind: 'change' as const })),
  z.looseObject({ event: z.string() }).transform((t) => ({ ...t, kind: 'event' as const })),
  z
    .looseObject({ clock: z.string(), days: z.array(z.string()).default([]) })
    .transform((t) => ({ ...t, kind: 'clock' as const })),
]);
export type RuleTrigger = z.infer<typeof ruleTriggerSchema>;

export const ruleSchema = z.looseObject({
  id: z.string().min(1),
  title: z.string().nullish(),
  enabled: z.boolean().default(true),
  priority: z.number().default(0),
  on: ruleTriggerSchema,
  if: z.string().nullish(),
  do: z.array(jsonValueSchema),
  once: z.boolean().default(false),
  cooldown: z.string().nullish(),
});
export type Rule = z.infer<typeof ruleSchema>;

export const rulebookDocumentSchema = z.looseObject({
  version: z.number().int().optional(),
  variables: z.array(ruleVariableSchema),
  rules: z.array(ruleSchema),
});
export type RulebookDocument = z.infer<typeof rulebookDocumentSchema>;

export const rulebookSchema = z.object({
  version: z.number().int(),
  document: rulebookDocumentSchema,
  updatedAt: epochMillisSchema,
});
export type Rulebook = z.infer<typeof rulebookSchema>;

// ----- 成员与运行态 -----

/** 在场的按出场顺序排在前，离开的排后面（服务端排好）。 */
export const worldMemberSchema = z.object({
  persona: personaRefSchema,
  displayOrder: z.number().int(),
  joinedAt: epochMillisSchema,
  leftAt: epochMillisNullableSchema,
  /** 玩家与这个角色的私聊，也是这个演员的身份。 */
  dmSessionId: z.string().min(1),
});
export type WorldMember = z.infer<typeof worldMemberSchema>;

export const storyEventSchema = z.object({
  id: z.string().min(1),
  atIso: z.string(),
  title: z.string(),
  note: z.string().nullable(),
});
export type StoryEvent = z.infer<typeof storyEventSchema>;

export const placeSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  zone: z.string().nullable(),
  note: z.string().nullable(),
});
export type Place = z.infer<typeof placeSchema>;

/** 一个规则变量写过的值：世界变量一个（`persona` 为 null），角色变量每个角色一个。值是文本。 */
export const ruleVariableValuesSchema = z.object({
  name: z.string().min(1),
  values: z.array(z.object({ persona: personaRefSchema.nullable(), value: z.string() })),
});
export type RuleVariableValues = z.infer<typeof ruleVariableValuesSchema>;

/** 世界 grain 的运行态快照：概要、故事钟、日程里还没发生的事件、地点、规则变量写过的值。 */
export const worldRuntimeSchema = z.object({
  overview: z.string(),
  storyClockIso: z.string().nullable(),
  events: z.array(storyEventSchema),
  places: z.array(placeSchema),
  variables: z.array(ruleVariableValuesSchema),
});
export type WorldRuntime = z.infer<typeof worldRuntimeSchema>;

export const worldDetailSchema = z.object({
  world: worldRowSchema,
  settings: worldSettingsSchema,
  /** 还没有世界书 / 规则书为 null。 */
  worldBook: worldBookSchema.nullable(),
  rulebook: rulebookSchema.nullable(),
  members: z.array(worldMemberSchema),
  sessions: z.array(sessionRowSchema),
  /** 世界 grain 从没激活过为 null。 */
  runtime: worldRuntimeSchema.nullable(),
});
export type WorldDetail = z.infer<typeof worldDetailSchema>;

// ----- 纪事与心理节拍 -----

/** 纪事种类是开放的，认不得的原样露。 */
export const ChronicleKindLabel: Readonly<Record<string, string>> = {
  turn: '私聊回合',
  channel: '频道',
  scene: '场景',
  member_enter: '成员加入',
  rule: '规则',
};

export const chronicleEntrySchema = z.object({
  id: z.string().min(1),
  kind: z.string(),
  persona: personaRefSchema.nullable(),
  sessionId: z.string().nullable(),
  /** 故事时刻（ISO）；世界钟还没走起来的旧条目为 null。 */
  storyAt: z.string().nullable(),
  text: z.string(),
  createdAt: epochMillisSchema,
});
export type ChronicleEntry = z.infer<typeof chronicleEntrySchema>;

export const beatOutcomeSchema = z.enum(['spoke', 'silent', 'stale', 'failed', 'skipped', 'deferred', 'dropped']);
export type BeatOutcome = z.infer<typeof beatOutcomeSchema>;

export const BeatOutcomeLabel: Readonly<Record<BeatOutcome, string>> = {
  spoke: '开口',
  silent: '沉默',
  stale: '已过时',
  failed: '失败',
  skipped: '跳过',
  deferred: '延后',
  dropped: '作废',
};

export const BeatOutcomeTone: Readonly<Record<BeatOutcome, StatusTone>> = {
  spoke: 'success',
  silent: 'info',
  stale: 'warning',
  failed: 'danger',
  skipped: 'warning',
  deferred: 'warning',
  dropped: 'warning',
};

/** `ActorBeatReasons`；`budget_*` 的后缀是预算拒绝的原因。码是开放的，认不得的原样露。 */
export const BeatReasonLabel: Readonly<Record<string, string>> = {
  triage: '分诊判不理',
  chose_silence: '自己选择沉默',
  no_output: '没有输出',
  stale: '信已过时',
  failed: '调用失败',
  rule_silent: '规则禁言',
  inactive: '角色未激活',
  quiet_hours: '静默时段',
  floor_taken: '发言权被占',
  budget_concurrency: '预算：并发已满',
  budget_hourly_quota: '预算：小时配额已满',
  left_place: '已离开地点',
};

/** 唤醒这一拍的信（`WorldSignalKinds`）。 */
export const BeatTriggerLabel: Readonly<Record<string, string>> = {
  member_enter: '有人加入',
  actor_spoke: '有人说话',
  actor_called: '被点名',
  actor_broadcast: '有人喊话',
  story_event_due: '事件到点',
  actor_entered: '有人进场',
  actor_left: '有人离场',
  alarm: '闹钟',
  directed: '导演意图',
};

export const beatSchema = z.object({
  id: z.string().min(1),
  persona: personaRefSchema,
  actorSessionId: z.string(),
  shownInSessionId: z.string(),
  placeId: z.string().nullable(),
  trigger: z.string(),
  perceived: z.string().nullable(),
  outcome: beatOutcomeSchema,
  /** 心声：只回流到这个演员自己的下一轮，别人读不到。 */
  innerThought: z.string().nullable(),
  /** 开口时为 null。 */
  reason: z.object({ code: z.string(), detail: z.string().nullable() }).nullable(),
  messageId: z.string().nullable(),
  storyAt: z.string().nullable(),
  createdAt: epochMillisSchema,
});
export type Beat = z.infer<typeof beatSchema>;

// ---------- 消息 ----------

export const messageRoleSchema = z.enum(['system', 'user', 'assistant']);
export type MessageRole = z.infer<typeof messageRoleSchema>;

export const MessageRoleLabel: Readonly<Record<MessageRole, string>> = {
  system: '系统',
  user: '玩家',
  assistant: '角色',
};

export const MessageRoleTone: Readonly<Record<MessageRole, StatusTone | 'primary'>> = {
  system: 'info',
  user: 'primary',
  assistant: 'success',
};

export const messageSourceSchema = z.enum(['user', 'assistant', 'proactive', 'interaction']);
export type MessageSource = z.infer<typeof messageSourceSchema>;

/** 只有不是被玩家问出来的那两种来路，才在消息头上标出来。 */
export const MessageSourceBadge: Readonly<Partial<Record<MessageSource, string>>> = {
  proactive: '自主开口',
  interaction: '互动',
};

export const messageStatusSchema = z.enum(['streaming', 'completed', 'failed']);
export type MessageStatus = z.infer<typeof messageStatusSchema>;

export const MessageStatusLabel: Readonly<Record<MessageStatus, string>> = {
  streaming: '生成中',
  completed: '已完成',
  failed: '失败',
};

export const MessageStatusTone: Readonly<Record<MessageStatus, StatusTone>> = {
  streaming: 'warning',
  completed: 'success',
  failed: 'danger',
};

/** 一条角色消息可以有几个人轮流说（场景），每段带可选的心声。 */
export const messageSegmentSchema = z.object({
  speaker: z.string().nullable(),
  said: z.string(),
  inner: z.string().nullable(),
});
export type MessageSegment = z.infer<typeof messageSegmentSchema>;

export const messageImageSchema = z.object({
  storageKey: z.string(),
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
  mime: z.string().nullable(),
});
export type MessageImage = z.infer<typeof messageImageSchema>;

export const textBodySchema = z.object({
  kind: z.literal('text'),
  segments: z.array(messageSegmentSchema),
  storyAt: z.string().nullable(),
});
export type TextBody = z.infer<typeof textBodySchema>;

export const imageBodySchema = z.object({
  kind: z.literal('image'),
  image: messageImageSchema,
  storyAt: z.string().nullable(),
});
export type ImageBody = z.infer<typeof imageBodySchema>;

export const messageContentSchema = z.discriminatedUnion('kind', [textBodySchema, imageBodySchema]);
export type MessageContent = z.infer<typeof messageContentSchema>;

export const messageRowSchema = z.object({
  id: z.string().min(1),
  seq: z.number().int(),
  role: messageRoleSchema,
  source: messageSourceSchema,
  status: messageStatusSchema,
  content: messageContentSchema,
  /** 已进召回记忆（向量索引）。 */
  memory: z.boolean(),
  createdAt: epochMillisSchema,
  updatedAt: epochMillisSchema,
  deletedAt: epochMillisNullableSchema,
});
export type MessageRow = z.infer<typeof messageRowSchema>;

// ---------- 会话记忆 ----------

export const sessionSummarySchema = z.object({
  text: z.string(),
  /** 摘要覆盖到第几条（seq）。 */
  coveredUntilSeq: z.number().int(),
  updatedAt: epochMillisSchema,
});
export type SessionSummary = z.infer<typeof sessionSummarySchema>;

export const sessionMemorySchema = z.object({
  session: sessionRowSchema,
  summary: sessionSummarySchema.nullable(),
  /** 只有私聊有状态卡。 */
  stateCard: jsonObjectSchema.nullable(),
  indexedCount: z.number().int().nonnegative(),
});
export type SessionMemory = z.infer<typeof sessionMemorySchema>;

export const memoryItemSchema = z.object({
  messageId: z.string().min(1),
  sessionId: z.string(),
  seq: z.number().int(),
  role: messageRoleSchema,
  text: z.string(),
  /** 出处的说法（本对话 / 本频道 / 某个频道名），服务端写好的，原样展示。 */
  source: z.string(),
  createdAt: epochMillisSchema,
});
export type MemoryItem = z.infer<typeof memoryItemSchema>;

// ---------- 角色卡 ----------

export const personaProfileSchema = z.object({
  tagline: z.string().nullable(),
  tags: z.array(z.string()),
  greetings: z.array(z.string()),
});
export type PersonaProfile = z.infer<typeof personaProfileSchema>;

/** 从市场卡导入的才有。 */
export const personaCardSchema = z.object({
  id: z.string().min(1),
  version: z.number().int().nullable(),
});
export type PersonaCard = z.infer<typeof personaCardSchema>;

export const personaRowSchema = z.object({
  id: z.number().int(),
  account: accountRefSchema,
  name: z.string(),
  avatar: z.string().nullable(),
  profile: personaProfileSchema,
  /** 现在还在的世界数（离开的不算）。 */
  worlds: z.number().int().nonnegative(),
  card: personaCardSchema.nullable(),
  createdAt: epochMillisSchema,
  updatedAt: epochMillisSchema,
  deletedAt: epochMillisNullableSchema,
});
export type PersonaRow = z.infer<typeof personaRowSchema>;

export const personaWorldSchema = z.object({
  world: z.object({
    id: z.string().min(1),
    accountUid: z.number().int(),
    title: z.string(),
    deletedAt: epochMillisNullableSchema,
  }),
  joinedAt: epochMillisSchema,
  leftAt: epochMillisNullableSchema,
});
export type PersonaWorld = z.infer<typeof personaWorldSchema>;

export const personaDetailSchema = z.object({
  persona: personaRowSchema,
  preset: presetSchema,
  /** 角色自带的旧格式世界书条目。 */
  worldBook: z.array(jsonValueSchema),
  worlds: z.array(personaWorldSchema),
});
export type PersonaDetail = z.infer<typeof personaDetailSchema>;
