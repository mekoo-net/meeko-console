import { z } from 'zod';

import { modelCapabilitiesSchema, type ModelCapabilities } from '@yomi/common';
import { epochMillisSchema } from '@/shared/lib/epoch';

/**
 * OneApi 的模型价格（美元牌价，全站一份，各产品按它出价）。
 *
 * 这张表的主人是 OneApi 的号池后台。管理端经平台 Bff 把请求原样转到它的 `/v1/ratecard/*`，成功的回包就是它的 JSON、不包信封，
 * 所以这里的字段照号池后台的 `ModelPriceDtos.cs` / `ModelPriceSyncService.cs` / `IModelPricePublisher.cs`。
 * 和平台别的接口有两处不一样：
 * - 值为 null 的字段号池后台不写出来。缺了和 null 是一回事，读进来统一成 null；
 * - 时间是 Unix 毫秒。
 */

/** 可空字段：缺了、给 null 都读成 null（见上）。 */
const nullable = <T extends z.ZodType>(schema: T) => schema.nullish().transform((v) => v ?? null);

/**
 * `rate` 原样留着，不按计价方式收紧形状（那是号池后台的校验）。
 * 收紧的话有两样做不成：号池后台以后多一种计价方式，这边整张表就读不出来了，连删都没法删；
 * 改价时要从原来的 rate 出发、只动表单里有的字段（见 `mergeRate`），先按形状读一遍会把表单不认识的键丢掉。
 */
const rateJsonSchema = z.record(z.string(), z.unknown());
export type RateJson = z.infer<typeof rateJsonSchema>;

// ---------- 表里的一行 ----------

export const modelPriceRowSchema = z.object({
  /** 库里的行号，走字符串。改、删都认它，不认模型键。 */
  id: z.string().min(1),
  /** 归一过的模型键（小写）。导入进来的旧行可能还带着日期钉、渠道前缀。 */
  modelKey: z.string().min(1),
  /** 厂家键（openai / anthropic / …，开放集合）；发布时一个厂家一份。 */
  maker: z.string().min(1),
  /** per_token / per_call / per_credit / per_image / per_video / per_audio_minute / per_character，以后可能还有别的。 */
  billingType: z.string().min(1),
  rate: rateJsonSchema,
  currency: z.string(),
  /** 外部目录带来的模型能力；手工录的行没有。 */
  capabilities: nullable(modelCapabilitiesSchema),
  /** manual / models_dev / openrouter / litellm / newapi */
  source: z.string(),
  sourceRef: nullable(z.string()),
  fetchedAtUtc: nullable(epochMillisSchema),
  effectiveFromUtc: epochMillisSchema,
});
export type ModelPriceRow = z.infer<typeof modelPriceRowSchema>;

export const priceMakerGroupSchema = z.object({
  maker: z.string().min(1),
  items: z.array(modelPriceRowSchema),
});
export type PriceMakerGroup = z.infer<typeof priceMakerGroupSchema>;

/** `GET catalog/by-maker`：整张表按厂家分好组，不分页；`total` 是组数。 */
export const priceMakerGroupsSchema = z.object({
  items: z.array(priceMakerGroupSchema),
  total: z.number().int(),
});

// ---------- 发布结果 ----------

/** 不是某一个厂家的失败（读不到库、连不上 NATS、这份表登记的主人是别的库）时，`maker` 是这个。 */
export const ALL_MAKERS = '*';

/**
 * 「这份表登记的主人是别的库」这一种失败的码。只有它是操作的人自己能处理的（确认以后接管），
 * 所以号池后台单独给了码；页面认它来摆「接管发布」，不去比对 `error` 那句话。
 */
export const OWNER_MISMATCH = 'owner_mismatch';

export const pricePublishFailureSchema = z.object({
  maker: z.string(),
  /** 号池后台写给管理员看的原因，原样显示。 */
  error: z.string(),
  /** 给程序认的原因；只有要分情况处理的那几种才有（现在只有 {@link OWNER_MISMATCH}）。 */
  code: z.string().nullish(),
});
export type PricePublishFailure = z.infer<typeof pricePublishFailureSchema>;

/**
 * 每个写操作都带回来的发布结果（号池后台把受影响的厂家发到 NATS 的桶里，平台收到以后再转给各产品）。
 * `ok` 为 false 时库里的改动是成了的，只是 `failures` 里的厂家发布出去的还是旧的。
 */
export const pricePublishResultSchema = z.object({
  ok: z.boolean(),
  /** 这次写了的厂家。 */
  written: z.array(z.string()),
  /** 这次撤下的厂家（表里一行都不剩了）。 */
  deleted: z.array(z.string()),
  /** 发布着的本来就和表里一样、没有写的厂家数。 */
  unchanged: z.number().int(),
  failures: z.array(pricePublishFailureSchema),
});
export type PricePublishResult = z.infer<typeof pricePublishResultSchema>;

export const priceWriteResultSchema = z.object({
  price: modelPriceRowSchema,
  publish: pricePublishResultSchema,
});
export type PriceWriteResult = z.infer<typeof priceWriteResultSchema>;

export const priceDeleteResultSchema = z.object({
  id: z.string(),
  publish: pricePublishResultSchema,
});
export type PriceDeleteResult = z.infer<typeof priceDeleteResultSchema>;

// ---------- 写一行 ----------

/**
 * `PUT catalog`。带 `id` 是改那一行：键原样不动，`modelKey` 不拿来找行。不带是按键录入：
 * 键会被收成干净名（剥渠道前缀和日期钉），表里已经有这个名字就是改那一行——所以新建之前要先查重。
 * 改已有的行不能省掉 `id`：导入进来的旧键没收过干净名，按干净名去找，改到的会是另一行。
 */
export interface UpsertPriceInput {
  id?: string;
  modelKey: string;
  /** 不给时号池后台按模型键推断——改已有的行要带上它现在的厂家，不然这一行可能被挪走。 */
  maker?: string;
  billingType: string;
  rate: RateJson;
  /** 不给时号池后台留着这一行原来的。 */
  capabilities?: ModelCapabilities;
}

// ---------- 上游同步 ----------

export const priceSourceStatusSchema = z.object({
  kind: z.string(),
  name: z.string(),
  ok: z.boolean(),
  error: nullable(z.string()),
  candidateCount: z.number().int(),
  elapsedMs: z.number(),
});
export type PriceSourceStatus = z.infer<typeof priceSourceStatusSchema>;

/** 某个来源对某个模型给出的报价；`rate` 已经折成美元。 */
export const priceCandidateSchema = z.object({
  sourceKind: z.string(),
  sourceName: z.string(),
  sourceRef: z.string(),
  maker: z.string(),
  modelId: z.string(),
  matchKind: z.string(),
  billingType: z.string().min(1),
  rate: rateJsonSchema,
  sourceCurrency: z.string(),
  fxApplied: z.number(),
  /** 和表里现有的那一行数值相同。 */
  sameAsCurrent: z.boolean(),
  capabilities: nullable(modelCapabilitiesSchema),
});
export type PriceCandidate = z.infer<typeof priceCandidateSchema>;

export const priceFetchItemSchema = z.object({
  /** 套用时写进表里的键（已经是干净名）。 */
  modelKey: z.string().min(1),
  maker: z.string(),
  /** 表里现有的那一行；没有就是新增。 */
  current: nullable(modelPriceRowSchema),
  /** 号池后台排好了序，第一条是它认为最该用的。 */
  candidates: z.array(priceCandidateSchema),
});
export type PriceFetchItem = z.infer<typeof priceFetchItemSchema>;

/** `POST sync/fetch`：只读，拉候选、和表里的对比，不写库也不发布。 */
export const priceFetchResultSchema = z.object({
  sources: z.array(priceSourceStatusSchema),
  items: z.array(priceFetchItemSchema),
  fetchedAtUtc: epochMillisSchema,
});
export type PriceFetchResult = z.infer<typeof priceFetchResultSchema>;

/** 套用的一行：候选的 `rate`（已经是美元）原样回传。 */
export interface ApplyPriceItem {
  modelKey: string;
  maker: string;
  billingType: string;
  rate: RateJson;
  sourceKind: string;
  sourceRef: string;
  capabilities?: ModelCapabilities;
}

/** `POST sync/apply`：任何一行校验不过，整批都不写。 */
export const priceApplyResultSchema = z.object({
  added: z.number().int(),
  updated: z.number().int(),
  publish: pricePublishResultSchema,
});
export type PriceApplyResult = z.infer<typeof priceApplyResultSchema>;

// ---------- 批量导入 ----------

/**
 * `POST import`：行的形状同表里的一行，多出来的字段号池后台不认也不报错，所以这里不约束行的类型。
 * 和录入不一样：键只做小写去空白、不收干净名，来源和时间照请求里的写。
 */
export interface ImportPricesInput {
  items: unknown[];
  /** 键已经在表里时：true 盖掉，false 跳过。 */
  overwrite: boolean;
}

export const priceImportResultSchema = z.object({
  added: z.number().int(),
  overwritten: z.number().int(),
  skipped: z.number().int(),
  publish: pricePublishResultSchema,
});
export type PriceImportResult = z.infer<typeof priceImportResultSchema>;

// ---------- 转发状态 ----------

/** 平台最近一次把新牌价通知给某个产品的结果。 */
export const ratecardRelaySubscriberSchema = z.object({
  service: z.string().min(1),
  notifiedAtUtc: nullable(epochMillisSchema),
  ok: z.boolean(),
  error: nullable(z.string()),
});
export type RatecardRelaySubscriber = z.infer<typeof ratecardRelaySubscriberSchema>;

/**
 * `GET relay`：这份表到了平台没有（平台的 Bff 订阅 OneApi 的 NATS，收到以后通知各产品）。
 * 这是 Bff 自己的接口，不转给号池后台。
 */
export const ratecardRelayStatusSchema = z.object({
  /** Bff 配了连 OneApi 的 NATS。 */
  configured: z.boolean(),
  /** 已经收到过一份。 */
  loaded: z.boolean(),
  fingerprint: nullable(z.string()),
  /** 收到的那一份里有几个厂家的文档。 */
  documentCount: z
    .number()
    .int()
    .nullish()
    .transform((v) => v ?? 0),
  receivedAtUtc: nullable(epochMillisSchema),
  /** 订阅现在出着错时的一句话。 */
  error: nullable(z.string()),
  subscribers: z
    .array(ratecardRelaySubscriberSchema)
    .nullish()
    .transform((v) => v ?? []),
});
export type RatecardRelayStatus = z.infer<typeof ratecardRelayStatusSchema>;
