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
 * 计费模式。
 * - `per_token`：按 token 数（input/output 分开计价，主流）
 * - `per_call`：按调用次数（一次固定价，常见于 image / function）
 * - `per_image`：按图片张数（结合分辨率会有阶梯）
 * - `per_minute`：按音频/视频时长
 */
export const pricingModeValues = ['per_token', 'per_call', 'per_image', 'per_minute'] as const;
export type PricingMode = (typeof pricingModeValues)[number];

export const PricingModeLabel: Readonly<Record<PricingMode, string>> = {
  per_token: '按 Token',
  per_call: '按调用',
  per_image: '按图片',
  per_minute: '按时长',
};

/** 调用日志单条状态 */
export const logStatusValues = ['ok', 'error', 'timeout', 'rate_limited', 'cancelled'] as const;
export type LogStatus = (typeof logStatusValues)[number];

export const LogStatusLabel: Readonly<Record<LogStatus, string>> = {
  ok: '成功',
  error: '失败',
  timeout: '超时',
  rate_limited: '限流',
  cancelled: '已取消',
};

export const LogStatusTone: Readonly<
  Record<LogStatus, 'success' | 'warning' | 'danger' | 'info'>
> = {
  ok: 'success',
  error: 'danger',
  timeout: 'danger',
  rate_limited: 'warning',
  cancelled: 'info',
};

export const apiTypeSchema = z.enum(apiTypeValues);
export const providerStatusSchema = z.enum(providerStatusValues);
export const modelFamilySchema = z.enum(modelFamilyValues);
export const modelCapabilitySchema = z.enum(modelCapabilityValues);
export const pricingModeSchema = z.enum(pricingModeValues);
export const logStatusSchema = z.enum(logStatusValues);
