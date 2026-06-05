import { createSnowflakeIdSeq, createUidSeq, type Uid } from '@/shared/lib/id';

import type {
  ApiType,
  BillReverseCode,
  ModelCapability,
  ModelFamily,
} from '../../model/enums';
import type {
  Provider,
  ProviderModel,
  ProviderModelMapping,
} from '../../model/provider.types';
import type { ProviderGroup, ProviderUpstreamModel } from '../../model/catalog.types';
import type { ModelRoute } from '../../model/modelRoute.types';
import type { Model } from '../../model/model.types';
import type { Pricing } from '../../model/pricing.types';
import type { LogEntry } from '../../model/log.types';

/**
 * demuxai 域共享内存仓。多个 Mock 类共享同一份引用，
 * 这样在 ProviderMock 里 reconcile 时，ModelMock / PricingMock 也能看到级联结果。
 *
 * 注意：这是模块单例，热重载会重置；这是符合预期的（Mock 数据本就为预览用）。
 */
export interface DemuxaiStore {
  providers: Provider[];
  models: Model[];
  pricing: Pricing[];
  logs: LogEntry[];
  providerGroups: ProviderGroup[];
  upstreamModels: ProviderUpstreamModel[];
  modelRoutes: ModelRoute[];
}

export const genProviderUid = createUidSeq(12_000_000);
export const genProviderModelUid = createUidSeq(15_000_000);
export const genMappingUid = createUidSeq(16_000_000);
export const genModelUid = createUidSeq(13_000_000);
export const genPricingUid = createUidSeq(14_000_000);
export const genLogUid = createSnowflakeIdSeq();
export const genModelRouteUid = createUidSeq(17_000_000);
export const genVendorModelUid = createUidSeq(18_000_000);
export const genProviderGroupUid = createUidSeq(19_000_000);
/** 生成日期+序列风格账单流水号，如 BL20260531000001234 */
const _billSerialSeq = createUidSeq(1);
export function genBillSerial(at: Date = new Date()): string {
  const ymd = at.toISOString().slice(0, 10).replace(/-/g, '');
  return `BL${ymd}${String(_billSerialSeq()).padStart(9, '0')}`;
}

/** 上游模型目录（Provider.fetchUpstreamModels 的 Mock 数据） */
export const upstreamCatalog: Readonly<Record<ApiType, readonly string[]>> = {
  openai: [
    'gpt-4o',
    'gpt-4o-mini',
    'gpt-4-turbo',
    'o1-preview',
    'o1-mini',
    'text-embedding-3-large',
    'text-embedding-3-small',
    'dall-e-3',
  ],
  anthropic: [
    'claude-3-5-sonnet-20241022',
    'claude-3-5-haiku-20241022',
    'claude-3-opus-20240229',
  ],
  gemini: ['gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-2.0-flash-exp'],
  azure_openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-35-turbo', 'text-embedding-ada-002'],
  baidu_qianfan: ['ernie-4.0-8k', 'ernie-3.5-128k', 'ernie-speed-128k'],
  aliyun_dashscope: [
    'qwen-max',
    'qwen-plus',
    'qwen-turbo',
    'qwen2.5-72b-instruct',
    'qwen2.5-32b-instruct',
  ],
  volcengine_ark: ['doubao-pro-256k', 'doubao-pro-128k', 'doubao-lite-32k'],
  tencent_hunyuan: ['hunyuan-pro', 'hunyuan-standard', 'hunyuan-lite'],
  zhipu_glm: ['glm-4-plus', 'glm-4', 'glm-4-flash', 'glm-4v-plus'],
  deepseek: ['deepseek-chat', 'deepseek-reasoner'],
  moonshot: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'],
  minimax: ['abab6.5s-chat', 'abab6.5g-chat'],
  siliconflow: [
    'Qwen/Qwen2.5-72B-Instruct',
    'meta-llama/Meta-Llama-3.1-70B-Instruct',
    'deepseek-ai/DeepSeek-V2.5',
  ],
  self_hosted_openai_compat: [
    'meta-llama/Llama-3.1-70B-Instruct',
    'meta-llama/Llama-3.1-8B-Instruct',
  ],
};

function epochMs(d: Date): number {
  return d.getTime();
}

const now = new Date('2026-05-12T10:00:00Z');

/** 按上游 modelName 推断 ModelFamily，新建 ProviderModel 时给的默认值 */
export function inferFamily(modelName: string): ModelFamily {
  const id = modelName.toLowerCase();
  if (id.includes('embedding')) return 'embedding';
  if (id.includes('dall') || id.includes('image')) return 'image';
  if (id.includes('whisper') || id.includes('tts') || id.includes('audio')) return 'audio';
  if (id.includes('claude')) return 'claude';
  if (id.includes('gemini')) return 'gemini';
  if (id.includes('qwen')) return 'qwen';
  if (id.includes('doubao')) return 'doubao';
  if (id.includes('deepseek')) return 'deepseek';
  if (id.includes('llama')) return 'llama';
  if (id.includes('mistral')) return 'mistral';
  if (id.includes('glm')) return 'glm';
  if (id.includes('gpt') || id.includes('o1') || id.includes('o3')) return 'gpt';
  return 'other';
}

/** 按 family 推断默认的 capabilities 集合 */
export function defaultCapabilitiesForFamily(family: ModelFamily): ModelCapability[] {
  switch (family) {
    case 'embedding':
      return ['embedding'];
    case 'image':
      return ['image_generation'];
    case 'audio':
      return ['audio_transcription'];
    default:
      return ['chat'];
  }
}

/** 自动生成一个 ProviderModel 默认元数据（拉取上游 / 手工新增时用） */
export function makeDefaultProviderModel(modelName: string): ProviderModel {
  const family = inferFamily(modelName);
  return {
    uid: genProviderModelUid(),
    modelName,
    family,
    capabilities: defaultCapabilitiesForFamily(family),
    visibleMinTier: 1,
    maxContextTokens: 8_192,
    maxOutputTokens: null,
  };
}

/** 把 displayName 包装成"平台层 Model"行（供 Models 页只读列表使用） */
function buildGlobalModel(displayName: string, pm: ProviderModel, at: number): Model {
  return {
    uid: genModelUid(),
    modelId: displayName,
    displayName,
    family: pm.family,
    capabilities: [...pm.capabilities],
    visibleMinTier: pm.visibleMinTier,
    maxContextTokens: pm.maxContextTokens,
    maxOutputTokens: pm.maxOutputTokens ?? null,
    supportsStreaming: pm.family !== 'embedding' && pm.family !== 'image',
    supportsFunctionCall: pm.capabilities.includes('tool_use'),
    description: null,
    createdAtUtc: at,
    updatedAtUtc: at,
  };
}

/** 集中放置 seedProviders 时用到的 ProviderModel 元数据模板，使种子保持可读 */
type Tpl = {
  family: ModelFamily;
  capabilities: ModelCapability[];
  visibleMinTier: number;
  maxContextTokens: number;
  maxOutputTokens: number | null;
};
const TPL = {
  gpt4o: {
    family: 'gpt',
    capabilities: ['chat', 'tool_use', 'vision', 'json_mode'],
    visibleMinTier: 2,
    maxContextTokens: 128_000,
    maxOutputTokens: 16_384,
  },
  gpt4omini: {
    family: 'gpt',
    capabilities: ['chat', 'tool_use', 'vision'],
    visibleMinTier: 1,
    maxContextTokens: 128_000,
    maxOutputTokens: 16_384,
  },
  gpt4turbo: {
    family: 'gpt',
    capabilities: ['chat', 'tool_use'],
    visibleMinTier: 2,
    maxContextTokens: 128_000,
    maxOutputTokens: 4_096,
  },
  o1mini: {
    family: 'gpt',
    capabilities: ['chat'],
    visibleMinTier: 2,
    maxContextTokens: 128_000,
    maxOutputTokens: 65_536,
  },
  embedLarge: {
    family: 'embedding',
    capabilities: ['embedding'],
    visibleMinTier: 1,
    maxContextTokens: 8_191,
    maxOutputTokens: null,
  },
  claudeSonnet: {
    family: 'claude',
    capabilities: ['chat', 'tool_use', 'vision', 'json_mode'],
    visibleMinTier: 3,
    maxContextTokens: 200_000,
    maxOutputTokens: 8_192,
  },
  claudeHaiku: {
    family: 'claude',
    capabilities: ['chat', 'tool_use'],
    visibleMinTier: 1,
    maxContextTokens: 200_000,
    maxOutputTokens: 8_192,
  },
  qwenMax: {
    family: 'qwen',
    capabilities: ['chat', 'tool_use', 'json_mode'],
    visibleMinTier: 1,
    maxContextTokens: 30_000,
    maxOutputTokens: 8_192,
  },
  qwenPlus: {
    family: 'qwen',
    capabilities: ['chat', 'tool_use'],
    visibleMinTier: 1,
    maxContextTokens: 131_000,
    maxOutputTokens: 8_192,
  },
  deepseekChat: {
    family: 'deepseek',
    capabilities: ['chat', 'tool_use', 'json_mode'],
    visibleMinTier: 1,
    maxContextTokens: 64_000,
    maxOutputTokens: 8_192,
  },
  deepseekR1: {
    family: 'deepseek',
    capabilities: ['chat'],
    visibleMinTier: 2,
    maxContextTokens: 64_000,
    maxOutputTokens: 32_768,
  },
  llama70b: {
    family: 'llama',
    capabilities: ['chat', 'tool_use'],
    visibleMinTier: 1,
    maxContextTokens: 32_000,
    maxOutputTokens: 4_096,
  },
  moonshot32k: {
    family: 'other',
    capabilities: ['chat'],
    visibleMinTier: 1,
    maxContextTokens: 32_000,
    maxOutputTokens: 4_096,
  },
  geminiFlash: {
    family: 'gemini',
    capabilities: ['chat', 'vision'],
    visibleMinTier: 1,
    maxContextTokens: 1_000_000,
    maxOutputTokens: 8_192,
  },
} as const satisfies Record<string, Tpl>;

function pm(modelName: string, tpl: Tpl): ProviderModel {
  return {
    uid: genProviderModelUid(),
    modelName,
    family: tpl.family,
    capabilities: [...tpl.capabilities],
    visibleMinTier: tpl.visibleMinTier,
    maxContextTokens: tpl.maxContextTokens,
    maxOutputTokens: tpl.maxOutputTokens,
  };
}

function mp(
  providerModelUid: Uid,
  displayName: string,
  opts: {
    enabled?: boolean;
    notes?: string | null;
  } = {},
): ProviderModelMapping {
  return {
    uid: genMappingUid(),
    providerModelUid,
    displayName,
    enabled: opts.enabled ?? true,
    notes: opts.notes ?? null,
  };
}

function seedProviders(): Provider[] {
  const t = epochMs(now);

  // —— Provider 1: OpenAI 直连（主）
  const o_gpt4o = pm('gpt-4o', TPL.gpt4o);
  const o_gpt4omini = pm('gpt-4o-mini', TPL.gpt4omini);
  const o_gpt4turbo = pm('gpt-4-turbo', TPL.gpt4turbo); // 仅入库不上架
  const o_o1mini = pm('o1-mini', TPL.o1mini);
  const o_emb3 = pm('text-embedding-3-large', TPL.embedLarge);
  const openaiMain: Provider = {
    id: 1001,
    uid: genProviderUid(),
    name: 'OpenAI 直连（主）',
    apiType: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    apiKeyMasked: 'sk-****abc1',
    notes: '总线主路由，覆盖 GPT 全系。月初有过一次限流，已设备援。',
    status: 'enabled',
    autoDisabledCode: null,
    testLatencyMs: 412,
    testSucceededAtUtc: epochMs(new Date(now.getTime() - 30 * 60 * 1000)),
    errorRate24h: 0.012,
    callCount24h: 18432,
    providerModels: [o_gpt4o, o_gpt4omini, o_gpt4turbo, o_o1mini, o_emb3],
    modelMappings: [
      mp(o_gpt4o.uid, 'GPT-4o'),
      mp(o_gpt4omini.uid, 'GPT-4o mini'),
      mp(o_gpt4omini.uid, 'GPT-4o mini（灰度）', {
        enabled: false,
        notes: '只对内部账号灰度，待稳定后下线',
      }),
      mp(o_o1mini.uid, 'o1-mini'),
      mp(o_emb3.uid, 'Text-Embedding-3-Large'),
    ],
    createdAtUtc: epochMs(new Date(now.getTime() - 60 * 86400000)),
    updatedAtUtc: t,
  };

  // —— Provider 2: Azure OpenAI（北美）—— 同 displayName 备援
  const a_gpt4o = pm('gpt-4o', TPL.gpt4o);
  const a_gpt4omini = pm('gpt-4o-mini', TPL.gpt4omini);
  const azureNA: Provider = {
    id: 1002,
    uid: genProviderUid(),
    name: 'Azure OpenAI（北美）',
    apiType: 'azure_openai',
    baseUrl: 'https://meeko-na.openai.azure.com',
    apiKeyMasked: 'ak-****d92f',
    notes: 'OpenAI 直连的同优先级备援，跨可用区。',
    status: 'enabled',
    autoDisabledCode: null,
    testLatencyMs: 638,
    testSucceededAtUtc: epochMs(new Date(now.getTime() - 60 * 60 * 1000)),
    errorRate24h: 0.004,
    callCount24h: 9201,
    providerModels: [a_gpt4o, a_gpt4omini],
    modelMappings: [
      mp(a_gpt4o.uid, 'GPT-4o'),
      mp(a_gpt4omini.uid, 'GPT-4o mini'),
    ],
    createdAtUtc: epochMs(new Date(now.getTime() - 90 * 86400000)),
    updatedAtUtc: t,
  };

  // —— Provider 3: Anthropic 直连
  const an_sonnet = pm('claude-3-5-sonnet-20241022', TPL.claudeSonnet);
  const an_haiku = pm('claude-3-5-haiku-20241022', TPL.claudeHaiku);
  const anthropic: Provider = {
    id: 1003,
    uid: genProviderUid(),
    name: 'Anthropic 直连',
    apiType: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    apiKeyMasked: 'sk-ant-****ee21',
    notes: null,
    status: 'enabled',
    autoDisabledCode: null,
    testLatencyMs: 521,
    testSucceededAtUtc: epochMs(new Date(now.getTime() - 10 * 60 * 1000)),
    errorRate24h: 0.008,
    callCount24h: 6541,
    providerModels: [an_sonnet, an_haiku],
    modelMappings: [
      mp(an_sonnet.uid, 'Claude 3.5 Sonnet'),
      mp(an_haiku.uid, 'Claude 3.5 Haiku'),
    ],
    createdAtUtc: epochMs(new Date(now.getTime() - 45 * 86400000)),
    updatedAtUtc: t,
  };

  // —— Provider 4: 阿里灵积
  const ali_max = pm('qwen-max', TPL.qwenMax);
  const ali_plus = pm('qwen-plus', TPL.qwenPlus);
  const aliyun: Provider = {
    id: 1004,
    uid: genProviderUid(),
    name: '阿里灵积',
    apiType: 'aliyun_dashscope',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    apiKeyMasked: 'sk-****77a3',
    notes: '主要用于中文长尾场景。',
    status: 'enabled',
    autoDisabledCode: null,
    testLatencyMs: 198,
    testSucceededAtUtc: epochMs(new Date(now.getTime() - 5 * 60 * 1000)),
    errorRate24h: 0.021,
    callCount24h: 23104,
    providerModels: [ali_max, ali_plus],
    modelMappings: [
      mp(ali_max.uid, 'Qwen-Max'),
      mp(ali_plus.uid, 'Qwen-Plus'),
    ],
    createdAtUtc: epochMs(new Date(now.getTime() - 120 * 86400000)),
    updatedAtUtc: t,
  };

  // —— Provider 5: DeepSeek 官方
  const ds_chat = pm('deepseek-chat', TPL.deepseekChat);
  const ds_reasoner = pm('deepseek-reasoner', TPL.deepseekR1);
  const deepseek: Provider = {
    id: 1005,
    uid: genProviderUid(),
    name: 'DeepSeek 官方',
    apiType: 'deepseek',
    baseUrl: 'https://api.deepseek.com',
    apiKeyMasked: 'sk-****119c',
    notes: '体量大、单价低，作为通用兜底。',
    status: 'enabled',
    autoDisabledCode: null,
    testLatencyMs: 312,
    testSucceededAtUtc: epochMs(new Date(now.getTime() - 8 * 60 * 1000)),
    errorRate24h: 0.005,
    callCount24h: 41208,
    providerModels: [ds_chat, ds_reasoner],
    modelMappings: [
      mp(ds_chat.uid, 'DeepSeek-V3'),
      mp(ds_reasoner.uid, 'DeepSeek-R1 (推理)'),
    ],
    createdAtUtc: epochMs(new Date(now.getTime() - 30 * 86400000)),
    updatedAtUtc: t,
  };

  // —— Provider 6: 自建 vLLM
  const sh_llama = pm('meta-llama/Llama-3.1-70B-Instruct', TPL.llama70b);
  const selfHosted: Provider = {
    id: 1006,
    uid: genProviderUid(),
    name: '自建 vLLM (Llama3.1-70B)',
    apiType: 'self_hosted_openai_compat',
    baseUrl: 'http://llm-vllm.meeko.internal:8000/v1',
    apiKeyMasked: 'sk-internal-****',
    notes: '机房内部署，仅企业版客户可见。',
    status: 'enabled',
    autoDisabledCode: null,
    testLatencyMs: 89,
    testSucceededAtUtc: epochMs(new Date(now.getTime() - 2 * 60 * 1000)),
    errorRate24h: 0.002,
    callCount24h: 3782,
    providerModels: [sh_llama],
    modelMappings: [mp(sh_llama.uid, 'Llama 3.1 70B (自建)')],
    createdAtUtc: epochMs(new Date(now.getTime() - 15 * 86400000)),
    updatedAtUtc: t,
  };

  // —— Provider 7: Moonshot 备份 (auto_disabled)
  const ms_32k = pm('moonshot-v1-32k', TPL.moonshot32k);
  const moonshot: Provider = {
    id: 1007,
    uid: genProviderUid(),
    name: 'Moonshot 备份',
    apiType: 'moonshot',
    baseUrl: 'https://api.moonshot.cn/v1',
    apiKeyMasked: 'sk-****0091',
    notes: '24h 内连续 5xx，已自动停用，等待恢复。',
    status: 'auto_disabled',
    autoDisabledCode: 'upstream_5xx_burst',
    testLatencyMs: null,
    testSucceededAtUtc: epochMs(new Date(now.getTime() - 6 * 60 * 60 * 1000)),
    errorRate24h: 0.65,
    callCount24h: 412,
    providerModels: [ms_32k],
    modelMappings: [mp(ms_32k.uid, 'Moonshot 32K')],
    createdAtUtc: epochMs(new Date(now.getTime() - 80 * 86400000)),
    updatedAtUtc: epochMs(new Date(now.getTime() - 2 * 60 * 60 * 1000)),
  };

  // —— Provider 8: Gemini 实验
  const g_flash = pm('gemini-1.5-flash', TPL.geminiFlash);
  const gemini: Provider = {
    id: 1008,
    uid: genProviderUid(),
    name: 'Gemini 实验渠道',
    apiType: 'gemini',
    baseUrl: 'https://generativelanguage.googleapis.com',
    apiKeyMasked: 'AIza****K01p',
    notes: '功能验证中，仅内部用户灰度。',
    status: 'disabled',
    autoDisabledCode: null,
    testLatencyMs: null,
    testSucceededAtUtc: null,
    errorRate24h: 0,
    callCount24h: 0,
    providerModels: [g_flash],
    modelMappings: [
      mp(g_flash.uid, 'Gemini 1.5 Flash', { notes: '灰度' }),
    ],
    createdAtUtc: epochMs(new Date(now.getTime() - 7 * 86400000)),
    updatedAtUtc: epochMs(new Date(now.getTime() - 3 * 86400000)),
  };

  return [openaiMain, azureNA, anthropic, aliyun, deepseek, selfHosted, moonshot, gemini];
}

/**
 * 平台层 Model = 跨 Provider 全局唯一的 `displayName`。
 *
 * - `Model.modelId` 直接取 `displayName`，是用户请求体里的 `model`
 *   字段（也是计费 / 配额主键）
 * - 元数据取**首个**承载它的 `ProviderModel`（在 BFF 端应是冲突校验
 *   或运营选定，前端 Mock 简化为"先到先得"）
 *
 * 当某 displayName 不再被任何 Provider 映射 → 自动 delete Model 行 + 级联 Pricing
 */
function seedModels(providers: Provider[]): Model[] {
  const t = epochMs(now);
  const seen = new Map<string, Model>();
  for (const p of providers) {
    for (const mapping of p.modelMappings) {
      if (seen.has(mapping.displayName)) continue;
      const pmRef = p.providerModels.find((x) => x.uid === mapping.providerModelUid);
      if (!pmRef) continue;
      seen.set(mapping.displayName, buildGlobalModel(mapping.displayName, pmRef, t));
    }
  }
  return [...seen.values()];
}

/**
 * 价格表种子。新模型主键 = displayName。
 *
 * 形状跟随 `docs/api/10-demuxai-pricing.md` 的 discriminated union：
 *  - `billingType` 顶层判别，`pricing` 嵌套对象按类型决定形状
 *  - 当前种子里全部是文本 / embedding 模型 → 全部 `per_token`；
 *    GPT-4o / Claude 3.5 Sonnet 多带 cachedRead/cachedWrite 字段，作为缓存价示例
 */
function seedPricing(models: Model[]): Pricing[] {
  const t = epochMs(now);
  type PricingBase = Omit<Pricing, 'id' | 'modelId' | 'updatedAtUtc' | 'effectiveFromUtc'>;
  const map = new Map<string, PricingBase>([
    [
      'GPT-4o',
      {
        billingType: 'per_token',
        pricing: {
          input: { perMToken: 18, cachedRead: 4.5 },
          output: { perMToken: 72 },
        },
        multiplier: 1.0,
        currency: 'CNY',
        tierMultipliers: { '5': 0.7, '4': 0.85 },
        updatedBy: { iamId: '200000001' },
      },
    ],
    [
      'GPT-4o mini',
      {
        billingType: 'per_token',
        pricing: {
          input: { perMToken: 1 },
          output: { perMToken: 4 },
        },
        multiplier: 1.0,
        currency: 'CNY',
        tierMultipliers: { '5': 0.6 },
        updatedBy: { iamId: '200000001' },
      },
    ],
    [
      'Claude 3.5 Sonnet',
      {
        billingType: 'per_token',
        pricing: {
          input: {
            perMToken: 22,
            cachedRead: 2.2,
            cachedWrite: 27.5,
          },
          output: { perMToken: 110 },
        },
        multiplier: 1.0,
        currency: 'CNY',
        tierMultipliers: { '5': 0.75 },
        updatedBy: { iamId: '200000001' },
      },
    ],
    [
      'DeepSeek-V3',
      {
        billingType: 'per_token',
        pricing: {
          input: { perMToken: 0.7 },
          output: { perMToken: 2 },
        },
        multiplier: 1.0,
        currency: 'CNY',
        tierMultipliers: {},
        updatedBy: { iamId: '200000001' },
      },
    ],
    [
      'DeepSeek-R1 (推理)',
      {
        billingType: 'per_token',
        pricing: {
          input: { perMToken: 4.5 },
          output: { perMToken: 18, reasoning: 18 },
        },
        multiplier: 1.0,
        currency: 'CNY',
        tierMultipliers: {},
        updatedBy: { iamId: '200000001' },
      },
    ],
    [
      'Qwen-Max',
      {
        billingType: 'per_token',
        pricing: {
          input: { perMToken: 20 },
          output: { perMToken: 60 },
        },
        multiplier: 1.0,
        currency: 'CNY',
        tierMultipliers: {},
        updatedBy: { iamId: '200000001' },
      },
    ],
    [
      'Llama 3.1 70B (自建)',
      {
        billingType: 'per_token',
        pricing: {
          input: { perMToken: 2 },
          output: { perMToken: 2 },
        },
        multiplier: 1.0,
        currency: 'CNY',
        tierMultipliers: { '5': 0.5, '4': 0.75 },
        updatedBy: { iamId: '200000001' },
      },
    ],
    [
      'Text-Embedding-3-Large',
      {
        billingType: 'per_token',
        pricing: {
          input: { perMToken: 0.9 },
          output: { perMToken: 0 },
        },
        multiplier: 1.0,
        currency: 'CNY',
        tierMultipliers: {},
        updatedBy: { iamId: '200000001' },
      },
    ],
  ]);

  return models
    .map((m) => {
      const base = map.get(m.modelId);
      if (!base) return null;
      return {
        ...base,
        id: genPricingUid(),
        modelId: m.modelId,
        effectiveFromUtc: epochMs(new Date(now.getTime() - 7 * 86400000)),
        updatedAtUtc: t,
      } as Pricing;
    })
    .filter((p): p is Pricing => p !== null);
}

const SEED_ACCOUNTS = ['100000001', '100000002', '100000003'] as const;
const SEED_ACCOUNT_CONTACTS: Readonly<
  Record<(typeof SEED_ACCOUNTS)[number], { displayName: string; email: string; phone: string }>
> = {
  '100000001': { displayName: '张三', email: 'zhangsan@example.com', phone: '13800138001' },
  '100000002': { displayName: '李四', email: 'lisi@example.com', phone: '13800138002' },
  '100000003': { displayName: '王五', email: 'wangwu@example.com', phone: '13800138003' },
};
const SEED_IAM_USERS = ['200000001', '700000001', '700000002'] as const;

/**
 * 抽样调用日志。
 *
 * 真实场景下日志会按 `billingType` 多态分布（token / image / video / ...）；
 * 当前 mock 的 Provider 全部是文本 LLM，所以这里全部以 `per_token` 抽样。
 * 等后续 seedProviders 增加图像 / 视频 / 音频 / TTS 模型，再扩展对应分支。
 */
function seedLogs(providers: Provider[]): LogEntry[] {
  const out: LogEntry[] = [];
  const errorCodes = ['upstream_5xx', 'upstream_timeout', 'rate_limited', 'context_too_long'];

  if (providers.length === 0) return out;

  const enabledProviders = providers.filter((p) => p.status === 'enabled');
  const usable = enabledProviders.length > 0 ? enabledProviders : providers;

  // 预提取每个 Provider 的「(显示名, 上游 modelName)」对，便于 Log 抽样
  type Pair = { displayName: string; modelName: string };
  const pairsByProvider = new Map<string, Pair[]>();
  for (const p of usable) {
    const pmIndex = new Map(p.providerModels.map((m) => [m.uid, m]));
    const list: Pair[] = [];
    for (const mapping of p.modelMappings) {
      const ref = pmIndex.get(mapping.providerModelUid);
      if (!ref) continue;
      list.push({ displayName: mapping.displayName, modelName: ref.modelName });
    }
    pairsByProvider.set(p.uid, list);
  }

  // error.code 与对应上游 httpStatus 的固定映射，方便 UI 校色 / 文案
  const errorCodeToHttp: Record<string, number> = {
    upstream_5xx: 502,
    upstream_timeout: 504,
    rate_limited: 429,
    context_too_long: 400,
    cancelled: 0,
  };

  // 预定义驳回原因码序列，用于种子里展示"已驳回"行的多样性
  const reverseReasons: BillReverseCode[] = [
    'service_unavailable',
    'metering_error',
    'customer_compensation',
    'manual_correction',
    'duplicate_charge',
  ];

  const mockTokenNames = ['生产 API', '测试环境', 'CI 流水线', '移动端 SDK', '内部工具'];
  const mockTokenIds = mockTokenNames.map((_, idx) => String(880001 + idx));

  for (let i = 0; i < 320; i += 1) {
    const p = usable[i % usable.length]!;
    const pairs = pairsByProvider.get(p.uid) ?? [];
    if (pairs.length === 0) continue;
    const pair = pairs[i % pairs.length]!;

    const occurred = new Date(now.getTime() - i * 11 * 60 * 1000);
    const prompt = 200 + (i * 37) % 4000;
    const completion = 80 + (i * 53) % 1600;
    const failed = i % 23 === 0;
    const success = !failed;
    const streamed = i % 2 === 0;

    const errorCode = failed ? errorCodes[i % errorCodes.length]! : null;
    const httpStatus = failed ? (errorCodeToHttp[errorCode!] ?? 500) : 200;

    // 失败请求里大约一半是"已扣费"（产品里最有驳回价值的场景），另一半没扣到
    const hasBill = !failed || (i % 2 === 0);
    // 每隔约 47 条预先种一条"已驳回"行，方便页面上看到两种状态
    const preReversed = hasBill && i % 47 === 11;

    const inputTokens = prompt;
    const outputTokens = failed ? 0 : completion;
    const totalTokens = inputTokens + outputTokens;
    // ---- 单价快照（元 / 1M tokens） ----
    const inputPerMToken = 18;
    const outputPerMToken = 72;
    const cachedReadPerMToken = 9;
    const cachedWritePerMToken = 22.5;
    // ---- 用量子维度（未触发为 0；mock 模型非音频 / 不计推理） ----
    const cachedReadTokens = 0;
    const cachedWriteTokens = 0;
    const inputAudioTokens = 0;
    const reasoningTokens = 0;
    const outputAudioTokens = 0;
    // ---- 实际扣费（公式：tokens / 1_000_000 × perMToken） ----
    const inputAmount = Math.round((inputTokens / 1_000_000) * inputPerMToken * 10000) / 10000;
    const outputAmount = Math.round((outputTokens / 1_000_000) * outputPerMToken * 10000) / 10000;
    const total = Math.round((inputAmount + outputAmount) * 10000) / 10000;

    // tokenLatency:
    //  - 失败 → null
    //  - 流式且成功 → 首字延迟 TTFT (80~580 ms)
    //  - 非流式且成功 → 端到端总耗时 (500~3000 ms，跟 completion 长度大致正相关)
    let tokenLatency: number | null;
    if (!success) {
      tokenLatency = null;
    } else if (streamed) {
      tokenLatency = 80 + ((i * 7) % 500);
    } else {
      tokenLatency = 500 + ((i * 13) % 2500);
    }

    // 每 ~6 条调用聚合到同一个 convId 模拟多轮对话
    const convSeq = Math.floor(i / 6);
    const convId = `CV-${(SEED_IAM_USERS[i % SEED_IAM_USERS.length]!).slice(-3)}-${convSeq.toString(36)}`;

    const accountUid = SEED_ACCOUNTS[i % SEED_ACCOUNTS.length]!;
    const accountContact = SEED_ACCOUNT_CONTACTS[accountUid];
    const isPg = i % 5 === 0;
    const token = isPg
      ? null
      : {
          id: mockTokenIds[i % mockTokenIds.length]!,
          name: mockTokenNames[i % mockTokenNames.length]!,
        };

    out.push({
      id: genLogUid(),
      createAt: occurred.getTime(),
      account: {
        uid: accountUid,
        iamId: SEED_IAM_USERS[i % SEED_IAM_USERS.length]!,
        displayName: accountContact.displayName,
        email: accountContact.email,
        phone: accountContact.phone,
      },
      convId,
      token,
      modelName: pair.displayName,
      providerId: p.id,
      apiType: p.apiType,
      billingType: 'per_token',
      usage: {
        totalTokens,
        input: {
          tokens: inputTokens,
          cachedReadTokens,
          cachedWriteTokens,
          audioTokens: inputAudioTokens,
        },
        output: {
          tokens: outputTokens,
          reasoningTokens,
          audioTokens: outputAudioTokens,
        },
      },
      cost: {
        input: {
          perMToken: inputPerMToken,
          amount: inputAmount,
          cachedRead: { perMToken: cachedReadPerMToken, amount: 0 },
          cachedWrite: { perMToken: cachedWritePerMToken, amount: 0 },
          audio: { perMToken: 0, amount: 0 },
        },
        output: {
          perMToken: outputPerMToken,
          amount: outputAmount,
          reasoning: { perMToken: 0, amount: 0 },
          audio: { perMToken: 0, amount: 0 },
        },
        multiplierSnapshot: 1.0,
        tierSnapshot: 1 + (i % 5),
        total,
      },
      tokenLatency,
      success,
      error: errorCode
        ? {
            code: errorCode,
            message: `${errorCode}: upstream returned ${httpStatus}`,
            httpStatus,
          }
        : null,
      clientIpV4: ((203 << 24) | (0 << 16) | (113 << 8) | ((i % 250) + 1)) >>> 0,
      streamed,
      bill: hasBill
        ? preReversed
          ? {
              id: genBillSerial(occurred),
              status: 'reversed',
              reversal: {
                atUtc: epochMs(new Date(occurred.getTime() + 30 * 60 * 1000)),
                by: '200000099',
                code: reverseReasons[i % reverseReasons.length]!,
                remark: null,
              },
            }
          : {
              id: genBillSerial(occurred),
              status: 'completed',
            }
        : null,
    });
  }
  return out.sort((a, b) => b.id.localeCompare(a.id));
}

/** apiType → 网关 vendor key（Mock 简化映射） */
function apiTypeToVendorKey(apiType: ApiType): string {
  const m: Partial<Record<ApiType, string>> = {
    openai: 'openai',
    anthropic: 'claude',
    gemini: 'gemini',
    deepseek: 'deepseek',
    moonshot: 'kiro',
    self_hosted_openai_compat: 'kiro',
  };
  return m[apiType] ?? apiType;
}

/**
 * 模拟 LLM 网关 `/cluster/status` 的发现源数据。
 *
 * 这是「网关此刻能服务的 QueueGroup + 上游模型」的快照；与控制面是否已入库无关。
 * 比已入库集合多一组 `cursor` 与若干新模型，用于演示「接入」页的过滤行为。
 */
export const gatewayDiscoveryCatalog: Readonly<
  Record<string, { displayName: string; models: readonly string[] }>
> = {
  kiro: {
    displayName: 'Kiro',
    models: ['claude-sonnet-4-6', 'claude-haiku-4-5', 'claude-opus-4-6', 'claude-opus-4-7-preview'],
  },
  gemini: {
    displayName: 'Gemini',
    models: ['gemini-2.0-flash-exp', 'gemini-1.5-pro', 'gemini-1.5-flash'],
  },
  codex: {
    displayName: 'Codex',
    models: ['gpt-4o', 'gpt-4o-mini', 'o1-mini', 'o1-preview'],
  },
  cursor: {
    displayName: 'Cursor',
    models: ['cursor-large', 'cursor-small'],
  },
};

/** 演示用「已入库」初始集合（admin 之前已通过接入页导入的内容）。 */
export function seedImportedProviderGroups(): ProviderGroup[] {
  const t = epochMs(now);
  return [
    { id: genProviderGroupUid(), queueGroup: 'kiro', vendorSlug: 'nai', status: 'active', upstreamModelCount: 3,
      notes: null, importedAtUtc: t, updatedAtUtc: t },
    { id: genProviderGroupUid(), queueGroup: 'gemini', vendorSlug: 'pa', status: 'active', upstreamModelCount: 3,
      notes: null, importedAtUtc: t, updatedAtUtc: t },
    { id: genProviderGroupUid(), queueGroup: 'codex', vendorSlug: 'rong', status: 'active', upstreamModelCount: 3,
      notes: null, importedAtUtc: t, updatedAtUtc: t },
  ];
}

/** 演示用「已入库」上游模型集合：每组取网关清单的前 3 条（模拟 admin 当初挑了一部分）。 */
export function seedImportedUpstreamModels(
  groups: ProviderGroup[],
): ProviderUpstreamModel[] {
  const out: ProviderUpstreamModel[] = [];
  for (const g of groups) {
    const ids = gatewayDiscoveryCatalog[g.queueGroup]?.models.slice(0, 3) ?? [];
    for (const id of ids) {
      out.push({ id: genVendorModelUid(), queueGroup: g.queueGroup, vendorModel: id, label: id });
    }
  }
  return out;
}

export function recomputeGroupModelCounts(
  groups: ProviderGroup[],
  models: ProviderUpstreamModel[],
): void {
  for (const g of groups) {
    g.upstreamModelCount = models.filter((m) => m.queueGroup === g.queueGroup).length;
  }
}

function toAlias(displayName: string): string {
  const slug = displayName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug.length >= 2 ? `demux-${slug}` : `demux-m-${Date.now().toString(36)}`;
}

function seedModelRoutes(providers: Provider[]): ModelRoute[] {
  const t = epochMs(now);
  const routes: ModelRoute[] = [];
  for (const p of providers) {
    const vendorKey = apiTypeToVendorKey(p.apiType); // = queueGroup
    for (const mapping of p.modelMappings) {
      if (!mapping.enabled) continue;
      const pmRef = p.providerModels.find((x) => x.uid === mapping.providerModelUid);
      if (!pmRef) continue;
      routes.push({
        uid: genModelRouteUid(),
        alias: toAlias(mapping.displayName),
        vendorKey,
        vendorModel: pmRef.modelName,
        weight: mapping.mappingWeight ?? 100,
        priority: 100,
        status: 'enabled',
        notes: mapping.notes ?? null,
        createdAtUtc: t,
        updatedAtUtc: t,
      });
    }
  }
  // 演示：同一 alias 双路由加权
  const gpt4o = routes.find((r) => r.alias === 'demux-gpt-4o');
  if (gpt4o) {
    routes.push({
      ...gpt4o,
      uid: genModelRouteUid(),
      vendorModel: 'gpt-4-turbo',
      weight: 20,
      priority: 90,
      notes: 'A/B 备线',
      createdAtUtc: t,
      updatedAtUtc: t,
    });
    gpt4o.weight = 80;
  }
  return routes;
}

/** 与 providerGroups / upstreamModels 对齐的演示别名（供应商组页展开可见） */
function seedCatalogModelRoutes(
  upstream: ProviderUpstreamModel[],
): ModelRoute[] {
  const t = epochMs(now);
  const has = (qg: string, id: string) =>
    upstream.some((m) => m.queueGroup === qg && m.vendorModel === id);
  const routes: ModelRoute[] = [];
  const add = (
    queueGroup: string,
    vendorModel: string,
    alias: string,
    weight = 100,
    notes: string | null = null,
  ) => {
    if (!has(queueGroup, vendorModel)) return;
    routes.push({
      uid: genModelRouteUid(),
      alias,
      vendorKey: queueGroup,
      vendorModel,
      weight,
      priority: 100,
      status: 'enabled',
      notes,
      createdAtUtc: t,
      updatedAtUtc: t,
    });
  };
  add('kiro', 'claude-sonnet-4-6', 'demux-claude-sonnet');
  add('kiro', 'claude-haiku-4-5', 'demux-claude-haiku');
  add('gemini', 'gemini-2.0-flash-exp', 'demux-gemini-flash');
  add('gemini', 'gemini-1.5-pro', 'demux-gemini-pro');
  add('codex', 'gpt-4o', 'demux-gpt-4o', 80);
  add('codex', 'gpt-4o-mini', 'demux-gpt-4o-mini');
  add('codex', 'o1-mini', 'demux-gpt-4o', 20, '同别名分流备线');
  return routes;
}

let cached: DemuxaiStore | null = null;

/** 模块级单例：第一次调用时建表 + 种子；避免不同 Port 看到不同视图。 */
export function getDemuxaiStore(): DemuxaiStore {
  if (cached !== null) return cached;
  const providers = seedProviders();
  const models = seedModels(providers);
  const pricing = seedPricing(models);
  const logs = seedLogs(providers);
  const providerGroups = seedImportedProviderGroups();
  const upstreamModels = seedImportedUpstreamModels(providerGroups);
  recomputeGroupModelCounts(providerGroups, upstreamModels);
  const modelRoutes = [
    ...seedCatalogModelRoutes(upstreamModels),
    ...seedModelRoutes(providers),
  ];
  cached = { providers, models, pricing, logs, providerGroups, upstreamModels, modelRoutes };
  return cached;
}

/** 仅供单测复位用；运行时不调用。 */
export function _resetDemuxaiStore(): void {
  cached = null;
}

/**
 * 平台模型重对账：按所有 Provider 的 `modelMappings.displayName` 重新计算
 * 应存活的 Model 集合。
 *
 *  - 新增 displayName → 自动 create Model（从首个承载它的 ProviderModel 取元数据）
 *  - 不再被引用的 displayName → 自动 delete Model + 级联 Pricing
 *
 * BFF 真实实现时模型走软删保留 join；前端 Mock 硬删。
 */
export interface ReconcileDiff {
  created: string[];
  deleted: string[];
}

/** 收集"应存活 displayName → 首个承载它的 ProviderModel"映射 */
function collectAliveModels(store: DemuxaiStore): Map<string, ProviderModel> {
  const alive = new Map<string, ProviderModel>();
  for (const p of store.providers) {
    const pmIndex = new Map(p.providerModels.map((m) => [m.uid, m]));
    for (const mapping of p.modelMappings) {
      if (alive.has(mapping.displayName)) continue;
      const pmRef = pmIndex.get(mapping.providerModelUid);
      if (!pmRef) continue;
      alive.set(mapping.displayName, pmRef);
    }
  }
  return alive;
}

export function reconcilePlatformModels(store: DemuxaiStore): ReconcileDiff {
  const t = new Date().getTime();
  const alive = collectAliveModels(store);
  const created: string[] = [];
  for (const [displayName, pmRef] of alive) {
    if (!store.models.some((m) => m.modelId === displayName)) {
      store.models.push(buildGlobalModel(displayName, pmRef, t));
      created.push(displayName);
    }
  }
  const deleted: string[] = [];
  store.models = store.models.filter((m) => {
    if (alive.has(m.modelId)) return true;
    deleted.push(m.modelId);
    return false;
  });
  if (deleted.length > 0) {
    const deletedSet = new Set(deleted);
    store.pricing = store.pricing.filter((p) => !deletedSet.has(p.modelId));
  }
  return { created, deleted };
}

/** 预演重对账（不修改 store），用于"保存前的副作用清单"提示 */
export function previewReconcile(
  store: DemuxaiStore,
  /** 模拟将要保存的 Provider（若 uid 为空 → 当作新建） */
  draft: {
    uid?: Uid;
    providerModels: ProviderModel[];
    modelMappings: ProviderModelMapping[];
  } | null,
  /** 模拟将要删除的 Provider uid */
  removingUid?: Uid,
): ReconcileDiff {
  const aliveSet = new Set<string>();
  for (const p of store.providers) {
    if (p.uid === removingUid) continue;
    if (draft && draft.uid === p.uid) continue;
    const pmIndex = new Map(p.providerModels.map((m) => [m.uid, m]));
    for (const mapping of p.modelMappings) {
      const pmRef = pmIndex.get(mapping.providerModelUid);
      if (!pmRef) continue;
      aliveSet.add(mapping.displayName);
    }
  }
  if (draft) {
    const pmIndex = new Map(draft.providerModels.map((m) => [m.uid, m]));
    for (const mapping of draft.modelMappings) {
      const pmRef = pmIndex.get(mapping.providerModelUid);
      if (!pmRef) continue;
      aliveSet.add(mapping.displayName);
    }
  }
  const created: string[] = [];
  for (const displayName of aliveSet) {
    if (!store.models.some((m) => m.modelId === displayName)) created.push(displayName);
  }
  const deleted: string[] = [];
  for (const m of store.models) {
    if (!aliveSet.has(m.modelId)) deleted.push(m.modelId);
  }
  return { created, deleted };
}
