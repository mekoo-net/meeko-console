import { createSnowflakeIdSeq, createUidSeq, type Uid } from '@/shared/lib/id';

import type {
  ApiType,
  ModelCapability,
  ModelFamily,
} from '../../model/enums';
import type {
  Provider,
  ProviderModel,
  ProviderModelMapping,
} from '../../model/provider.types';
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
}

export const genProviderUid = createUidSeq(12_000_000);
export const genProviderModelUid = createUidSeq(15_000_000);
export const genMappingUid = createUidSeq(16_000_000);
export const genModelUid = createUidSeq(13_000_000);
export const genPricingUid = createUidSeq(14_000_000);
export const genLogUid = createSnowflakeIdSeq();

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

function iso(d: Date): string {
  return d.toISOString();
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
function buildGlobalModel(displayName: string, pm: ProviderModel, t: string): Model {
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
    createdAtUtc: t,
    updatedAtUtc: t,
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
  const t = iso(now);

  // —— Provider 1: OpenAI 直连（主）
  const o_gpt4o = pm('gpt-4o', TPL.gpt4o);
  const o_gpt4omini = pm('gpt-4o-mini', TPL.gpt4omini);
  const o_gpt4turbo = pm('gpt-4-turbo', TPL.gpt4turbo); // 仅入库不上架
  const o_o1mini = pm('o1-mini', TPL.o1mini);
  const o_emb3 = pm('text-embedding-3-large', TPL.embedLarge);
  const openaiMain: Provider = {
    uid: genProviderUid(),
    name: 'OpenAI 直连（主）',
    apiType: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    apiKeyMasked: 'sk-****abc1',
    notes: '总线主路由，覆盖 GPT 全系。月初有过一次限流，已设备援。',
    status: 'enabled',
    autoDisabledCode: null,
    testLatencyMs: 412,
    testSucceededAtUtc: iso(new Date(now.getTime() - 30 * 60 * 1000)),
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
    createdAtUtc: iso(new Date(now.getTime() - 60 * 86400000)),
    updatedAtUtc: t,
  };

  // —— Provider 2: Azure OpenAI（北美）—— 同 displayName 备援
  const a_gpt4o = pm('gpt-4o', TPL.gpt4o);
  const a_gpt4omini = pm('gpt-4o-mini', TPL.gpt4omini);
  const azureNA: Provider = {
    uid: genProviderUid(),
    name: 'Azure OpenAI（北美）',
    apiType: 'azure_openai',
    baseUrl: 'https://meeko-na.openai.azure.com',
    apiKeyMasked: 'ak-****d92f',
    notes: 'OpenAI 直连的同优先级备援，跨可用区。',
    status: 'enabled',
    autoDisabledCode: null,
    testLatencyMs: 638,
    testSucceededAtUtc: iso(new Date(now.getTime() - 60 * 60 * 1000)),
    errorRate24h: 0.004,
    callCount24h: 9201,
    providerModels: [a_gpt4o, a_gpt4omini],
    modelMappings: [
      mp(a_gpt4o.uid, 'GPT-4o'),
      mp(a_gpt4omini.uid, 'GPT-4o mini'),
    ],
    createdAtUtc: iso(new Date(now.getTime() - 90 * 86400000)),
    updatedAtUtc: t,
  };

  // —— Provider 3: Anthropic 直连
  const an_sonnet = pm('claude-3-5-sonnet-20241022', TPL.claudeSonnet);
  const an_haiku = pm('claude-3-5-haiku-20241022', TPL.claudeHaiku);
  const anthropic: Provider = {
    uid: genProviderUid(),
    name: 'Anthropic 直连',
    apiType: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    apiKeyMasked: 'sk-ant-****ee21',
    notes: null,
    status: 'enabled',
    autoDisabledCode: null,
    testLatencyMs: 521,
    testSucceededAtUtc: iso(new Date(now.getTime() - 10 * 60 * 1000)),
    errorRate24h: 0.008,
    callCount24h: 6541,
    providerModels: [an_sonnet, an_haiku],
    modelMappings: [
      mp(an_sonnet.uid, 'Claude 3.5 Sonnet'),
      mp(an_haiku.uid, 'Claude 3.5 Haiku'),
    ],
    createdAtUtc: iso(new Date(now.getTime() - 45 * 86400000)),
    updatedAtUtc: t,
  };

  // —— Provider 4: 阿里灵积
  const ali_max = pm('qwen-max', TPL.qwenMax);
  const ali_plus = pm('qwen-plus', TPL.qwenPlus);
  const aliyun: Provider = {
    uid: genProviderUid(),
    name: '阿里灵积',
    apiType: 'aliyun_dashscope',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    apiKeyMasked: 'sk-****77a3',
    notes: '主要用于中文长尾场景。',
    status: 'enabled',
    autoDisabledCode: null,
    testLatencyMs: 198,
    testSucceededAtUtc: iso(new Date(now.getTime() - 5 * 60 * 1000)),
    errorRate24h: 0.021,
    callCount24h: 23104,
    providerModels: [ali_max, ali_plus],
    modelMappings: [
      mp(ali_max.uid, 'Qwen-Max'),
      mp(ali_plus.uid, 'Qwen-Plus'),
    ],
    createdAtUtc: iso(new Date(now.getTime() - 120 * 86400000)),
    updatedAtUtc: t,
  };

  // —— Provider 5: DeepSeek 官方
  const ds_chat = pm('deepseek-chat', TPL.deepseekChat);
  const ds_reasoner = pm('deepseek-reasoner', TPL.deepseekR1);
  const deepseek: Provider = {
    uid: genProviderUid(),
    name: 'DeepSeek 官方',
    apiType: 'deepseek',
    baseUrl: 'https://api.deepseek.com',
    apiKeyMasked: 'sk-****119c',
    notes: '体量大、单价低，作为通用兜底。',
    status: 'enabled',
    autoDisabledCode: null,
    testLatencyMs: 312,
    testSucceededAtUtc: iso(new Date(now.getTime() - 8 * 60 * 1000)),
    errorRate24h: 0.005,
    callCount24h: 41208,
    providerModels: [ds_chat, ds_reasoner],
    modelMappings: [
      mp(ds_chat.uid, 'DeepSeek-V3'),
      mp(ds_reasoner.uid, 'DeepSeek-R1 (推理)'),
    ],
    createdAtUtc: iso(new Date(now.getTime() - 30 * 86400000)),
    updatedAtUtc: t,
  };

  // —— Provider 6: 自建 vLLM
  const sh_llama = pm('meta-llama/Llama-3.1-70B-Instruct', TPL.llama70b);
  const selfHosted: Provider = {
    uid: genProviderUid(),
    name: '自建 vLLM (Llama3.1-70B)',
    apiType: 'self_hosted_openai_compat',
    baseUrl: 'http://llm-vllm.meeko.internal:8000/v1',
    apiKeyMasked: 'sk-internal-****',
    notes: '机房内部署，仅企业版客户可见。',
    status: 'enabled',
    autoDisabledCode: null,
    testLatencyMs: 89,
    testSucceededAtUtc: iso(new Date(now.getTime() - 2 * 60 * 1000)),
    errorRate24h: 0.002,
    callCount24h: 3782,
    providerModels: [sh_llama],
    modelMappings: [mp(sh_llama.uid, 'Llama 3.1 70B (自建)')],
    createdAtUtc: iso(new Date(now.getTime() - 15 * 86400000)),
    updatedAtUtc: t,
  };

  // —— Provider 7: Moonshot 备份 (auto_disabled)
  const ms_32k = pm('moonshot-v1-32k', TPL.moonshot32k);
  const moonshot: Provider = {
    uid: genProviderUid(),
    name: 'Moonshot 备份',
    apiType: 'moonshot',
    baseUrl: 'https://api.moonshot.cn/v1',
    apiKeyMasked: 'sk-****0091',
    notes: '24h 内连续 5xx，已自动停用，等待恢复。',
    status: 'auto_disabled',
    autoDisabledCode: 'upstream_5xx_burst',
    testLatencyMs: null,
    testSucceededAtUtc: iso(new Date(now.getTime() - 6 * 60 * 60 * 1000)),
    errorRate24h: 0.65,
    callCount24h: 412,
    providerModels: [ms_32k],
    modelMappings: [mp(ms_32k.uid, 'Moonshot 32K')],
    createdAtUtc: iso(new Date(now.getTime() - 80 * 86400000)),
    updatedAtUtc: iso(new Date(now.getTime() - 2 * 60 * 60 * 1000)),
  };

  // —— Provider 8: Gemini 实验
  const g_flash = pm('gemini-1.5-flash', TPL.geminiFlash);
  const gemini: Provider = {
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
    createdAtUtc: iso(new Date(now.getTime() - 7 * 86400000)),
    updatedAtUtc: iso(new Date(now.getTime() - 3 * 86400000)),
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
  const t = iso(now);
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

/** 价格表种子。新模型主键 = displayName。 */
function seedPricing(models: Model[]): Pricing[] {
  const t = iso(now);
  type PricingBase = Omit<Pricing, 'uid' | 'modelId' | 'updatedAtUtc' | 'effectiveFromUtc'>;
  const map = new Map<string, PricingBase>([
    [
      'GPT-4o',
      {
        mode: 'per_token',
        inputPricePerKToken: 0.018,
        outputPricePerKToken: 0.072,
        pricePerCall: null,
        pricePerImage: null,
        pricePerMinute: null,
        multiplier: 1.0,
        currency: 'CNY',
        tierMultipliers: { '5': 0.7, '4': 0.85 },
        updatedByIamUid: '200000001',
      },
    ],
    [
      'GPT-4o mini',
      {
        mode: 'per_token',
        inputPricePerKToken: 0.001,
        outputPricePerKToken: 0.004,
        pricePerCall: null,
        pricePerImage: null,
        pricePerMinute: null,
        multiplier: 1.0,
        currency: 'CNY',
        tierMultipliers: { '5': 0.6 },
        updatedByIamUid: '200000001',
      },
    ],
    [
      'Claude 3.5 Sonnet',
      {
        mode: 'per_token',
        inputPricePerKToken: 0.022,
        outputPricePerKToken: 0.11,
        pricePerCall: null,
        pricePerImage: null,
        pricePerMinute: null,
        multiplier: 1.0,
        currency: 'CNY',
        tierMultipliers: { '5': 0.75 },
        updatedByIamUid: '200000001',
      },
    ],
    [
      'DeepSeek-V3',
      {
        mode: 'per_token',
        inputPricePerKToken: 0.0007,
        outputPricePerKToken: 0.002,
        pricePerCall: null,
        pricePerImage: null,
        pricePerMinute: null,
        multiplier: 1.0,
        currency: 'CNY',
        tierMultipliers: {},
        updatedByIamUid: '200000001',
      },
    ],
    [
      'DeepSeek-R1 (推理)',
      {
        mode: 'per_token',
        inputPricePerKToken: 0.0045,
        outputPricePerKToken: 0.018,
        pricePerCall: null,
        pricePerImage: null,
        pricePerMinute: null,
        multiplier: 1.0,
        currency: 'CNY',
        tierMultipliers: {},
        updatedByIamUid: '200000001',
      },
    ],
    [
      'Qwen-Max',
      {
        mode: 'per_token',
        inputPricePerKToken: 0.02,
        outputPricePerKToken: 0.06,
        pricePerCall: null,
        pricePerImage: null,
        pricePerMinute: null,
        multiplier: 1.0,
        currency: 'CNY',
        tierMultipliers: {},
        updatedByIamUid: '200000001',
      },
    ],
    [
      'Llama 3.1 70B (自建)',
      {
        mode: 'per_token',
        inputPricePerKToken: 0.002,
        outputPricePerKToken: 0.002,
        pricePerCall: null,
        pricePerImage: null,
        pricePerMinute: null,
        multiplier: 1.0,
        currency: 'CNY',
        tierMultipliers: { '5': 0.5, '4': 0.75 },
        updatedByIamUid: '200000001',
      },
    ],
    [
      'Text-Embedding-3-Large',
      {
        mode: 'per_token',
        inputPricePerKToken: 0.0009,
        outputPricePerKToken: 0,
        pricePerCall: null,
        pricePerImage: null,
        pricePerMinute: null,
        multiplier: 1.0,
        currency: 'CNY',
        tierMultipliers: {},
        updatedByIamUid: '200000001',
      },
    ],
  ]);

  return models
    .map((m) => {
      const base = map.get(m.modelId);
      if (!base) return null;
      return {
        ...base,
        uid: genPricingUid(),
        modelId: m.modelId,
        effectiveFromUtc: iso(new Date(now.getTime() - 7 * 86400000)),
        updatedAtUtc: t,
      } satisfies Pricing;
    })
    .filter((p): p is Pricing => p !== null);
}

const SEED_ACCOUNTS = ['100000001', '100000002', '100000003'] as const;
const SEED_IAM_USERS = ['200000001', '700000001', '700000002'] as const;

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

  for (let i = 0; i < 320; i += 1) {
    const p = usable[i % usable.length]!;
    const pairs = pairsByProvider.get(p.uid) ?? [];
    if (pairs.length === 0) continue;
    const pair = pairs[i % pairs.length]!;

    const occurred = new Date(now.getTime() - i * 11 * 60 * 1000);
    const prompt = 200 + (i * 37) % 4000;
    const completion = 80 + (i * 53) % 1600;
    const failed = i % 23 === 0;
    const slow = i % 17 === 0;
    const inputCost = (prompt / 1000) * 0.018;
    const outputCost = (completion / 1000) * 0.072;
    const status = failed
      ? (['error', 'timeout', 'rate_limited'] as const)[i % 3]!
      : 'ok';
    const httpStatus = failed
      ? status === 'timeout'
        ? 504
        : status === 'rate_limited'
          ? 429
          : 502
      : 200;
    out.push({
      uid: genLogUid(),
      occurredAtUtc: occurred.toISOString(),
      accountUid: SEED_ACCOUNTS[i % SEED_ACCOUNTS.length]!,
      iamUserUid: SEED_IAM_USERS[i % SEED_IAM_USERS.length]!,
      modelId: pair.displayName,
      providerUid: p.uid,
      providerModelId: pair.modelName,
      apiType: p.apiType,
      promptTokens: prompt,
      completionTokens: failed ? 0 : completion,
      totalTokens: prompt + (failed ? 0 : completion),
      inputCost,
      outputCost: failed ? 0 : outputCost,
      totalCost: inputCost + (failed ? 0 : outputCost),
      multiplierSnapshot: 1.0,
      tierSnapshot: 1 + (i % 5),
      latencyMs: failed
        ? status === 'timeout'
          ? 30000
          : 800
        : slow
          ? 4500
          : 200 + (i * 13) % 1200,
      firstTokenLatencyMs: failed ? null : 80 + (i * 7) % 500,
      status,
      httpStatus,
      errorCode: failed ? errorCodes[i % errorCodes.length]! : null,
      errorMessage: failed
        ? `${errorCodes[i % errorCodes.length]!}: upstream returned ${httpStatus}`
        : null,
      requestIp: `203.0.113.${(i % 250) + 1}`,
      streamed: i % 2 === 0,
    });
  }
  return out.sort((a, b) => b.uid.localeCompare(a.uid));
}

let cached: DemuxaiStore | null = null;

/** 模块级单例：第一次调用时建表 + 种子；避免不同 Port 看到不同视图。 */
export function getDemuxaiStore(): DemuxaiStore {
  if (cached !== null) return cached;
  const providers = seedProviders();
  const models = seedModels(providers);
  const pricing = seedPricing(models);
  const logs = seedLogs(providers);
  cached = { providers, models, pricing, logs };
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
  const t = new Date().toISOString();
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
