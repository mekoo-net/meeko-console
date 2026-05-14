import { z } from 'zod';

/**
 * 上游 API 协议类型。一个 Provider 只能选一种 apiType（HTTP 协议族）。
 *
 * 选型逻辑：把"协议族"作为一级分类，具体云厂商 / 自建集群作为二级标签。
 * - 同一厂商兼容多协议（如自建 vLLM 同时支持 OpenAI 兼容） → 配多个 Provider。
 * - DeepSeek / Moonshot 等虽然是 OpenAI 兼容，但作为独立 apiType 列出，
 *   方便迁移成本核算、报表分组、以及厂商专有参数适配。
 */
export const apiTypeValues = [
  'openai',
  'anthropic',
  'gemini',
  'azure_openai',
  'baidu_qianfan',
  'aliyun_dashscope',
  'volcengine_ark',
  'tencent_hunyuan',
  'zhipu_glm',
  'deepseek',
  'moonshot',
  'minimax',
  'siliconflow',
  'self_hosted_openai_compat',
] as const;
export type ApiType = (typeof apiTypeValues)[number];

export const ApiTypeLabel: Readonly<Record<ApiType, string>> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  gemini: 'Google Gemini',
  azure_openai: 'Azure OpenAI',
  baidu_qianfan: '百度千帆',
  aliyun_dashscope: '阿里灵积',
  volcengine_ark: '火山方舟',
  tencent_hunyuan: '腾讯混元',
  zhipu_glm: '智谱 GLM',
  deepseek: 'DeepSeek',
  moonshot: 'Moonshot',
  minimax: 'MiniMax',
  siliconflow: 'SiliconFlow',
  self_hosted_openai_compat: '自建（OpenAI 兼容）',
};

/**
 * Provider 状态。
 * - `enabled`：正常参与路由
 * - `disabled`：人工禁用，路由跳过
 * - `auto_disabled`：调度器探测到连续错误自动停用，必须人工恢复（防止"自愈"波动）
 */
export const providerStatusValues = ['enabled', 'disabled', 'auto_disabled'] as const;
export type ProviderStatus = (typeof providerStatusValues)[number];

export const ProviderStatusLabel: Readonly<Record<ProviderStatus, string>> = {
  enabled: '启用中',
  disabled: '已禁用',
  auto_disabled: '自动停用',
};

export const ProviderStatusTone: Readonly<
  Record<ProviderStatus, 'success' | 'warning' | 'danger' | 'info'>
> = {
  enabled: 'success',
  disabled: 'info',
  auto_disabled: 'danger',
};

/** 模型族 —— 主要用于 UI 分组 / 图标，不影响路由 */
export const modelFamilyValues = [
  'gpt',
  'claude',
  'gemini',
  'qwen',
  'doubao',
  'glm',
  'deepseek',
  'llama',
  'mistral',
  'embedding',
  'image',
  'audio',
  'other',
] as const;
export type ModelFamily = (typeof modelFamilyValues)[number];

export const ModelFamilyLabel: Readonly<Record<ModelFamily, string>> = {
  gpt: 'GPT 系列',
  claude: 'Claude 系列',
  gemini: 'Gemini 系列',
  qwen: '通义千问',
  doubao: '豆包',
  glm: 'GLM',
  deepseek: 'DeepSeek',
  llama: 'Llama',
  mistral: 'Mistral',
  embedding: '向量嵌入',
  image: '图像生成',
  audio: '音频',
  other: '其它',
};

/** 模型能力（位集合，UI 用 tag 多选展示） */
export const modelCapabilityValues = [
  'chat',
  'completion',
  'embedding',
  'image_generation',
  'image_understanding',
  'audio_transcription',
  'audio_synthesis',
  'tool_use',
  'vision',
  'json_mode',
] as const;
export type ModelCapability = (typeof modelCapabilityValues)[number];

export const ModelCapabilityLabel: Readonly<Record<ModelCapability, string>> = {
  chat: '对话',
  completion: '补全',
  embedding: '向量化',
  image_generation: '文生图',
  image_understanding: '图像理解',
  audio_transcription: '语音识别',
  audio_synthesis: '语音合成',
  tool_use: '函数调用',
  vision: '视觉输入',
  json_mode: 'JSON 模式',
};

/**
 * 计费类型（discriminated union 的判别字段）。
 *
 * 每种 `billingType` 对应一种 `pricing` 嵌套形状，详见 `pricing.types.ts`。
 *
 * - `per_token`        ：文本 LLM / embedding / rerank（input + output + 可选 cached / reasoning）
 * - `per_call`         ：单次平价（function call、moderation 等）
 * - `per_image`        ：文生图（按 size × quality 分档，DALL-E / SD / MJ）
 * - `per_video`        ：文生视频（按 resolution 分档，按秒计费，Sora / Gen-3 / Kling）
 * - `per_audio_minute` ：语音转写（按音频时长，Whisper / 实时 ASR）
 * - `per_character`    ：文生语音（按千字符，TTS / ElevenLabs / CosyVoice）
 */
export const billingTypeValues = [
  'per_token',
  'per_call',
  'per_image',
  'per_video',
  'per_audio_minute',
  'per_character',
] as const;
export type BillingType = (typeof billingTypeValues)[number];

export const BillingTypeLabel: Readonly<Record<BillingType, string>> = {
  per_token: '按 Token',
  per_call: '按调用',
  per_image: '按图片',
  per_video: '按视频',
  per_audio_minute: '按音频时长',
  per_character: '按字符',
};

/**
 * 调用日志错误码（常见值）。
 *
 * `LogEntry.error.code` 字段保持为开放 string —— 上游错误码千差万别，
 * 这里只列前端 UI 已知的典型值用于配色 / 国际化映射；遇到未知码走默认配色。
 */
export const KNOWN_LOG_ERROR_CODES = [
  'upstream_5xx',
  'upstream_4xx',
  'upstream_timeout',
  'rate_limited',
  'context_too_long',
  'cancelled',
  'auth_failed',
  'unknown',
] as const;
export type KnownLogErrorCode = (typeof KNOWN_LOG_ERROR_CODES)[number];

export const LogErrorCodeLabel: Readonly<Record<KnownLogErrorCode, string>> = {
  upstream_5xx: '上游 5xx',
  upstream_4xx: '上游 4xx',
  upstream_timeout: '上游超时',
  rate_limited: '被限流',
  context_too_long: '上下文超长',
  cancelled: '已取消',
  auth_failed: '鉴权失败',
  unknown: '未知错误',
};

export const apiTypeSchema = z.enum(apiTypeValues);
export const providerStatusSchema = z.enum(providerStatusValues);
export const modelFamilySchema = z.enum(modelFamilyValues);
export const modelCapabilitySchema = z.enum(modelCapabilityValues);
export const billingTypeSchema = z.enum(billingTypeValues);
