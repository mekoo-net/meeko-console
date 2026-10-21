/**
 * 官方美元牌价快照。按 `kind` 拆开：LLM、向量、图像、视频、音频、语音各自只有自己那套价字段，
 * 不会在同一类型上摊平 `input/output/embedding` 再靠布尔开关解释。
 *
 * 固化成静态表、不在启动时联网拉取——mock 要能离线跑，且每次打开看到的数字一样。
 * 要更新真库里的价走页面上的「上游同步」（后端 `ModelPriceSyncService`），不是重启前端。
 *
 * 取数口径：
 *  - LLM：models.dev `GET https://models.dev/api.json`（2026-09-19），只取第一方源、文本入/出齐全的基准档；
 *  - 向量：快照口径滤掉了没有文本输出的模型，OpenAI / Google / Mistral 的 embedding 仍在源里，
 *    千问 `text-embedding-v*` 按 DashScope 牌价后补；
 *  - 图像 / 视频 / 音频 / 语音：不按 token 计，按厂家文档的张 / 秒 / 分钟 / 字符档登记。
 *  - `maker` 按模型键判定而非按源：阿里云也卖 `glm-5.2` / `kimi-k3`，厂家仍是智谱 / Moonshot。
 *
 * 单位是美元；价格表原样入库，编译时乘渠道倍率得到人民币。
 */
import type { ModelCapabilities, RateBody } from '@yomi/common';
import { scaleRateBody } from '../../model/rateScale';

export { scaleRateBody };

interface OfficialUsdBase {
  maker: string;
  modelKey: string;
}

/** 对话 / 文本。价是入、出、可选缓存；`audio` / `reasoning` 是能力，不是价。 */
export interface OfficialLlmUsdPrice extends OfficialUsdBase {
  kind: 'llm';
  input: number;
  output: number;
  cachedRead?: number;
  cachedWrite?: number;
  audio?: true;
  reasoning?: true;
}

/** 向量化：只有入价。 */
export interface OfficialEmbeddingUsdPrice extends OfficialUsdBase {
  kind: 'embedding';
  input: number;
}

export interface OfficialImageUsdPrice extends OfficialUsdBase {
  kind: 'image';
  tiers: readonly { size: string; quality: string; pricePerImage: number }[];
}

export interface OfficialVideoUsdPrice extends OfficialUsdBase {
  kind: 'video';
  tiers: readonly { resolution: string; pricePerSecond: number }[];
  minSeconds?: number;
  maxSeconds?: number;
}

export interface OfficialAudioUsdPrice extends OfficialUsdBase {
  kind: 'audio';
  pricePerMinute: number;
}

export interface OfficialSpeechUsdPrice extends OfficialUsdBase {
  kind: 'speech';
  pricePerKChar: number;
}

export type OfficialUsdPrice =
  | OfficialLlmUsdPrice
  | OfficialEmbeddingUsdPrice
  | OfficialImageUsdPrice
  | OfficialVideoUsdPrice
  | OfficialAudioUsdPrice
  | OfficialSpeechUsdPrice;

function llm(
  maker: string,
  modelKey: string,
  price: Omit<OfficialLlmUsdPrice, 'kind' | 'maker' | 'modelKey'>,
): OfficialLlmUsdPrice {
  return { kind: 'llm', maker, modelKey, ...price };
}

function embedding(maker: string, modelKey: string, input: number): OfficialEmbeddingUsdPrice {
  return { kind: 'embedding', maker, modelKey, input };
}

function image(
  maker: string,
  modelKey: string,
  tiers: OfficialImageUsdPrice['tiers'],
): OfficialImageUsdPrice {
  return { kind: 'image', maker, modelKey, tiers };
}

function video(
  maker: string,
  modelKey: string,
  price: Omit<OfficialVideoUsdPrice, 'kind' | 'maker' | 'modelKey'>,
): OfficialVideoUsdPrice {
  return { kind: 'video', maker, modelKey, ...price };
}

function audio(maker: string, modelKey: string, pricePerMinute: number): OfficialAudioUsdPrice {
  return { kind: 'audio', maker, modelKey, pricePerMinute };
}

function speech(maker: string, modelKey: string, pricePerKChar: number): OfficialSpeechUsdPrice {
  return { kind: 'speech', maker, modelKey, pricePerKChar };
}

/** 快照行 → 美元 `RateBody`。向量化在契约里仍是 `per_token`，但只有入价、出为 0。 */
export function officialUsdRateBody(row: OfficialUsdPrice): RateBody {
  switch (row.kind) {
    case 'llm':
      return {
        billingType: 'per_token',
        rate: {
          input: {
            perMToken: row.input,
            ...(row.cachedRead != null ? { cachedRead: row.cachedRead } : {}),
            ...(row.cachedWrite != null ? { cachedWrite: row.cachedWrite } : {}),
          },
          output: { perMToken: row.output },
        },
      };
    case 'embedding':
      return {
        billingType: 'per_token',
        rate: { input: { perMToken: row.input }, output: { perMToken: 0 } },
      };
    case 'image':
      return { billingType: 'per_image', rate: { tiers: row.tiers.map((t) => ({ ...t })) } };
    case 'video':
      return {
        billingType: 'per_video',
        rate: {
          tiers: row.tiers.map((t) => ({ ...t })),
          ...(row.minSeconds != null ? { minSeconds: row.minSeconds } : {}),
          ...(row.maxSeconds != null ? { maxSeconds: row.maxSeconds } : {}),
        },
      };
    case 'audio':
      return { billingType: 'per_audio_minute', rate: { pricePerMinute: row.pricePerMinute } };
    case 'speech':
      return { billingType: 'per_character', rate: { pricePerKChar: row.pricePerKChar } };
  }
}

export function officialUsdCapabilities(row: OfficialUsdPrice): ModelCapabilities | null {
  switch (row.kind) {
    case 'llm':
      return { audio: row.audio === true, reasoning: row.reasoning === true, embedding: false };
    case 'embedding':
      return { audio: false, reasoning: false, embedding: true };
    default:
      return null;
  }
}

export const OFFICIAL_USD_PRICES: readonly OfficialUsdPrice[] = [
  // openai (43)
  llm('openai', 'gpt-3.5-turbo', { input: 0.5, output: 1.5, cachedRead: 0 }),
  llm('openai', 'gpt-4', { input: 30, output: 60 }),
  llm('openai', 'gpt-4-turbo', { input: 10, output: 30 }),
  llm('openai', 'gpt-4.1', { input: 2, output: 8, cachedRead: 0.5 }),
  llm('openai', 'gpt-4.1-mini', { input: 0.4, output: 1.6, cachedRead: 0.1 }),
  llm('openai', 'gpt-4.1-nano', { input: 0.1, output: 0.4, cachedRead: 0.025 }),
  llm('openai', 'gpt-4o', { input: 2.5, output: 10, cachedRead: 1.25 }),
  llm('openai', 'gpt-4o-2024-05-13', { input: 5, output: 15 }),
  llm('openai', 'gpt-4o-2024-08-06', { input: 2.5, output: 10, cachedRead: 1.25 }),
  llm('openai', 'gpt-4o-2024-11-20', { input: 2.5, output: 10, cachedRead: 1.25, audio: true }),
  llm('openai', 'gpt-4o-mini', { input: 0.15, output: 0.6, cachedRead: 0.075 }),
  llm('openai', 'gpt-5', { input: 1.25, output: 10, cachedRead: 0.125, reasoning: true }),
  llm('openai', 'gpt-5-mini', { input: 0.25, output: 2, cachedRead: 0.025, reasoning: true }),
  llm('openai', 'gpt-5-nano', { input: 0.05, output: 0.4, cachedRead: 0.005, reasoning: true }),
  llm('openai', 'gpt-5-pro', { input: 15, output: 120, reasoning: true }),
  llm('openai', 'gpt-5.1', { input: 1.25, output: 10, cachedRead: 0.125, audio: true, reasoning: true }),
  llm('openai', 'gpt-5.2', { input: 1.75, output: 14, cachedRead: 0.175, reasoning: true }),
  llm('openai', 'gpt-5.2-chat-latest', { input: 1.75, output: 14, cachedRead: 0.175, reasoning: true }),
  llm('openai', 'gpt-5.2-pro', { input: 21, output: 168, reasoning: true }),
  llm('openai', 'gpt-5.3-chat-latest', { input: 1.75, output: 14, cachedRead: 0.175, reasoning: true }),
  llm('openai', 'gpt-5.3-codex', { input: 1.75, output: 14, cachedRead: 0.175, reasoning: true }),
  llm('openai', 'gpt-5.3-codex-spark', { input: 1.75, output: 14, cachedRead: 0.175, reasoning: true }),
  llm('openai', 'gpt-5.4', { input: 2.5, output: 15, cachedRead: 0.25, reasoning: true }),
  llm('openai', 'gpt-5.4-mini', { input: 0.75, output: 4.5, cachedRead: 0.075, reasoning: true }),
  llm('openai', 'gpt-5.4-nano', { input: 0.2, output: 1.25, cachedRead: 0.02, reasoning: true }),
  llm('openai', 'gpt-5.4-pro', { input: 30, output: 180, reasoning: true }),
  llm('openai', 'gpt-5.5', { input: 5, output: 30, cachedRead: 0.5, reasoning: true }),
  llm('openai', 'gpt-5.5-pro', { input: 30, output: 180, reasoning: true }),
  llm('openai', 'gpt-5.6', { input: 4, output: 20, cachedRead: 0.4, cachedWrite: 5, reasoning: true }),
  llm('openai', 'gpt-5.6-luna', { input: 0.2, output: 1.2, cachedRead: 0.02, cachedWrite: 0.25, reasoning: true }),
  llm('openai', 'gpt-5.6-sol', { input: 4, output: 20, cachedRead: 0.4, cachedWrite: 5, reasoning: true }),
  llm('openai', 'gpt-5.6-terra', { input: 2, output: 12, cachedRead: 0.2, cachedWrite: 2.5, reasoning: true }),
  llm('openai', 'gpt-6-astra', { input: 10, output: 50, cachedRead: 1, cachedWrite: 12.5, reasoning: true }),
  llm('openai', 'gpt-realtime-2.1', { input: 4, output: 24, cachedRead: 0.4, audio: true, reasoning: true }),
  llm('openai', 'o1', { input: 15, output: 60, cachedRead: 7.5, reasoning: true }),
  llm('openai', 'o1-pro', { input: 150, output: 600, reasoning: true }),
  llm('openai', 'o3', { input: 2, output: 8, cachedRead: 0.5, reasoning: true }),
  llm('openai', 'o3-mini', { input: 1.1, output: 4.4, cachedRead: 0.55, reasoning: true }),
  llm('openai', 'o3-pro', { input: 20, output: 80, reasoning: true }),
  llm('openai', 'o4-mini', { input: 1.1, output: 4.4, cachedRead: 0.275, reasoning: true }),
  embedding('openai', 'text-embedding-3-large', 0.13),
  embedding('openai', 'text-embedding-3-small', 0.02),
  embedding('openai', 'text-embedding-ada-002', 0.1),
  image('openai', 'gpt-image-1', [
    { size: '1024x1024', quality: 'low', pricePerImage: 0.011 },
    { size: '1024x1024', quality: 'medium', pricePerImage: 0.042 },
    { size: '1024x1024', quality: 'high', pricePerImage: 0.167 },
  ]),
  image('openai', 'dall-e-3', [
    { size: '1024x1024', quality: 'standard', pricePerImage: 0.04 },
    { size: '1024x1024', quality: 'hd', pricePerImage: 0.08 },
    { size: '1792x1024', quality: 'standard', pricePerImage: 0.08 },
    { size: '1792x1024', quality: 'hd', pricePerImage: 0.12 },
  ]),
  audio('openai', 'whisper-1', 0.006),
  speech('openai', 'tts-1', 0.015),
  // anthropic (14)
  llm('anthropic', 'claude-fable-5', { input: 10, output: 50, cachedRead: 1, cachedWrite: 12.5, reasoning: true }),
  llm('anthropic', 'claude-fable-5-1', { input: 10, output: 50, cachedRead: 0.25, cachedWrite: 12.5, reasoning: true }),
  llm('anthropic', 'claude-haiku-4-5', { input: 1, output: 5, cachedRead: 0.1, cachedWrite: 1.25, reasoning: true }),
  llm('anthropic', 'claude-haiku-4-5-20251001', { input: 1, output: 5, cachedRead: 0.1, cachedWrite: 1.25, reasoning: true }),
  llm('anthropic', 'claude-opus-4-5', { input: 5, output: 25, cachedRead: 0.5, cachedWrite: 6.25, reasoning: true }),
  llm('anthropic', 'claude-opus-4-5-20251101', { input: 5, output: 25, cachedRead: 0.5, cachedWrite: 6.25, reasoning: true }),
  llm('anthropic', 'claude-opus-4-6', { input: 5, output: 25, cachedRead: 0.5, cachedWrite: 6.25, reasoning: true }),
  llm('anthropic', 'claude-opus-4-7', { input: 5, output: 25, cachedRead: 0.5, cachedWrite: 6.25, reasoning: true }),
  llm('anthropic', 'claude-opus-4-8', { input: 5, output: 25, cachedRead: 0.5, cachedWrite: 6.25, reasoning: true }),
  llm('anthropic', 'claude-opus-5', { input: 5, output: 25, cachedRead: 0.5, cachedWrite: 6.25, reasoning: true }),
  llm('anthropic', 'claude-sonnet-4-5', { input: 3, output: 15, cachedRead: 0.3, cachedWrite: 3.75, reasoning: true }),
  llm('anthropic', 'claude-sonnet-4-5-20250929', { input: 3, output: 15, cachedRead: 0.3, cachedWrite: 3.75, reasoning: true }),
  llm('anthropic', 'claude-sonnet-4-6', { input: 3, output: 15, cachedRead: 0.3, cachedWrite: 3.75, reasoning: true }),
  llm('anthropic', 'claude-sonnet-5', { input: 2, output: 10, cachedRead: 0.2, cachedWrite: 2.5, reasoning: true }),
  // google (28)
  llm('google', 'deep-research-max-preview-04-2026', { input: 2, output: 12, cachedRead: 0.2, audio: true, reasoning: true }),
  llm('google', 'deep-research-preview-04-2026', { input: 2, output: 12, cachedRead: 0.2, audio: true, reasoning: true }),
  llm('google', 'gemini-2.5-computer-use-preview-10-2025', { input: 1.25, output: 10, reasoning: true }),
  llm('google', 'gemini-2.5-flash', { input: 0.3, output: 2.5, cachedRead: 0.03, audio: true, reasoning: true }),
  llm('google', 'gemini-2.5-flash-image', { input: 0.3, output: 30, cachedRead: 0.075, reasoning: true }),
  llm('google', 'gemini-2.5-flash-lite', { input: 0.1, output: 0.4, cachedRead: 0.01, audio: true, reasoning: true }),
  llm('google', 'gemini-2.5-pro', { input: 1.25, output: 10, cachedRead: 0.125, audio: true, reasoning: true }),
  llm('google', 'gemini-3-flash-preview', { input: 0.5, output: 3, cachedRead: 0.05, audio: true, reasoning: true }),
  llm('google', 'gemini-3-pro-image', { input: 2, output: 120, reasoning: true }),
  llm('google', 'gemini-3-pro-image-preview', { input: 2, output: 120, reasoning: true }),
  llm('google', 'gemini-3.1-flash-image', { input: 0.5, output: 60, reasoning: true }),
  llm('google', 'gemini-3.1-flash-image-preview', { input: 0.5, output: 60, reasoning: true }),
  llm('google', 'gemini-3.1-flash-lite', { input: 0.25, output: 1.5, cachedRead: 0.025, audio: true, reasoning: true }),
  llm('google', 'gemini-3.1-flash-lite-image', { input: 0.25, output: 30, reasoning: true }),
  llm('google', 'gemini-3.1-flash-lite-preview', { input: 0.25, output: 1.5, cachedRead: 0.025, audio: true, reasoning: true }),
  llm('google', 'gemini-3.1-flash-live-preview', { input: 0.75, output: 4.5, audio: true, reasoning: true }),
  llm('google', 'gemini-3.1-pro-preview', { input: 2, output: 12, cachedRead: 0.2, audio: true, reasoning: true }),
  llm('google', 'gemini-3.1-pro-preview-customtools', { input: 2, output: 12, cachedRead: 0.2, audio: true, reasoning: true }),
  llm('google', 'gemini-3.5-flash', { input: 1.5, output: 9, cachedRead: 0.15, audio: true, reasoning: true }),
  llm('google', 'gemini-3.5-flash-lite', { input: 0.3, output: 2.5, cachedRead: 0.03, audio: true, reasoning: true }),
  llm('google', 'gemini-3.5-live-translate-preview', { input: 3.5, output: 21, audio: true }),
  llm('google', 'gemini-3.6-flash', { input: 0.75, output: 3.75, cachedRead: 0.075, audio: true, reasoning: true }),
  llm('google', 'gemini-3.7-flash', { input: 0.75, output: 3.75, cachedRead: 0.075, audio: true, reasoning: true }),
  llm('google', 'gemini-3.8-flash', { input: 0.75, output: 3.75, cachedRead: 0.075, audio: true, reasoning: true }),
  embedding('google', 'gemini-embedding-001', 0.15),
  embedding('google', 'gemini-embedding-2', 0.2),
  video('google', 'veo-3', {
    tiers: [
      { resolution: '720p', pricePerSecond: 0.4 },
      { resolution: '1080p', pricePerSecond: 0.6 },
    ],
    minSeconds: 4,
    maxSeconds: 8,
  }),
  llm('google', 'gemini-flash-latest', { input: 0.75, output: 3.75, cachedRead: 0.075, audio: true, reasoning: true }),
  llm('google', 'gemini-flash-lite-latest', { input: 0.3, output: 2.5, cachedRead: 0.03, audio: true, reasoning: true }),
  // deepseek (5)
  llm('deepseek', 'deepseek-flash', { input: 0.15, output: 0.6, cachedRead: 0.003, reasoning: true }),
  llm('deepseek', 'deepseek-v4-flash', { input: 0.15, output: 0.6, cachedRead: 0.003, reasoning: true }),
  llm('deepseek', 'deepseek-v4-flash-0731', { input: 0.2, output: 0.4, cachedRead: 0.04, reasoning: true }),
  llm('deepseek', 'deepseek-v4-flash-vision-exp', { input: 0.15, output: 0.6, cachedRead: 0.003, reasoning: true }),
  llm('deepseek', 'deepseek-v4-pro', { input: 0.435, output: 0.87, cachedRead: 0.003625, reasoning: true }),
  // qwen (53)
  llm('qwen', 'qvq-max', { input: 1.2, output: 4.8, reasoning: true }),
  llm('qwen', 'qwen-flash', { input: 0.05, output: 0.4, reasoning: true }),
  llm('qwen', 'qwen-max', { input: 1.6, output: 6.4 }),
  llm('qwen', 'qwen-mt-plus', { input: 2.46, output: 7.37 }),
  llm('qwen', 'qwen-mt-turbo', { input: 0.16, output: 0.49 }),
  llm('qwen', 'qwen-omni-turbo', { input: 0.07, output: 0.27, audio: true }),
  llm('qwen', 'qwen-omni-turbo-realtime', { input: 0.27, output: 1.07, audio: true }),
  llm('qwen', 'qwen-plus', { input: 0.4, output: 1.2, reasoning: true }),
  llm('qwen', 'qwen-plus-character-ja', { input: 0.5, output: 1.4 }),
  llm('qwen', 'qwen-turbo', { input: 0.05, output: 0.2, reasoning: true }),
  llm('qwen', 'qwen-vl-max', { input: 0.8, output: 3.2 }),
  llm('qwen', 'qwen-vl-ocr', { input: 0.72, output: 0.72 }),
  llm('qwen', 'qwen-vl-plus', { input: 0.21, output: 0.63 }),
  embedding('qwen', 'text-embedding-v1', 0.1),
  embedding('qwen', 'text-embedding-v2', 0.1),
  embedding('qwen', 'text-embedding-v3', 0.07),
  embedding('qwen', 'text-embedding-v4', 0.07),
  embedding('qwen', 'qwen3-embedding-0.6b', 0.01),
  embedding('qwen', 'qwen3-embedding-4b', 0.01),
  embedding('qwen', 'qwen3-embedding-8b', 0.01),
  embedding('qwen', 'qwen3-vl-embedding', 0.09),
  embedding('qwen', 'qwen3.7-text-embedding', 0.07),
  embedding('qwen', 'tongyi-embedding-vision-plus', 0.09),
  embedding('qwen', 'tongyi-embedding-vision-flash', 0.03),
  llm('qwen', 'qwen2-5-14b-instruct', { input: 0.35, output: 1.4 }),
  llm('qwen', 'qwen2-5-32b-instruct', { input: 0.7, output: 2.8 }),
  llm('qwen', 'qwen2-5-72b-instruct', { input: 1.4, output: 5.6 }),
  llm('qwen', 'qwen2-5-7b-instruct', { input: 0.175, output: 0.7 }),
  llm('qwen', 'qwen2-5-omni-7b', { input: 0.1, output: 0.4, audio: true }),
  llm('qwen', 'qwen2-5-vl-72b-instruct', { input: 2.8, output: 8.4 }),
  llm('qwen', 'qwen2-5-vl-7b-instruct', { input: 0.35, output: 1.05 }),
  llm('qwen', 'qwen3-14b', { input: 0.35, output: 1.4, reasoning: true }),
  llm('qwen', 'qwen3-235b-a22b', { input: 0.7, output: 2.8, reasoning: true }),
  llm('qwen', 'qwen3-32b', { input: 0.7, output: 2.8, reasoning: true }),
  llm('qwen', 'qwen3-8b', { input: 0.18, output: 0.7, reasoning: true }),
  llm('qwen', 'qwen3-asr-flash', { input: 0.035, output: 0.035, audio: true }),
  llm('qwen', 'qwen3-coder-30b-a3b-instruct', { input: 0.45, output: 2.25 }),
  llm('qwen', 'qwen3-coder-480b-a35b-instruct', { input: 1.5, output: 7.5 }),
  llm('qwen', 'qwen3-coder-flash', { input: 0.3, output: 1.5 }),
  llm('qwen', 'qwen3-coder-plus', { input: 1, output: 5 }),
  llm('qwen', 'qwen3-livetranslate-flash-realtime', { input: 10, output: 10, audio: true }),
  llm('qwen', 'qwen3-max', { input: 1.2, output: 6, reasoning: true }),
  llm('qwen', 'qwen3-next-80b-a3b-instruct', { input: 0.5, output: 2 }),
  llm('qwen', 'qwen3-next-80b-a3b-thinking', { input: 0.5, output: 6, reasoning: true }),
  llm('qwen', 'qwen3-omni-flash', { input: 0.43, output: 1.66, audio: true, reasoning: true }),
  llm('qwen', 'qwen3-omni-flash-realtime', { input: 0.52, output: 1.99, audio: true }),
  llm('qwen', 'qwen3-vl-235b-a22b', { input: 0.7, output: 2.8, reasoning: true }),
  llm('qwen', 'qwen3-vl-30b-a3b', { input: 0.2, output: 0.8, reasoning: true }),
  llm('qwen', 'qwen3-vl-plus', { input: 0.2, output: 1.6, reasoning: true }),
  llm('qwen', 'qwen3.5-122b-a10b', { input: 0.4, output: 3.2, audio: true, reasoning: true }),
  llm('qwen', 'qwen3.5-27b', { input: 0.3, output: 2.4, audio: true, reasoning: true }),
  llm('qwen', 'qwen3.5-35b-a3b', { input: 0.25, output: 2, audio: true, reasoning: true }),
  llm('qwen', 'qwen3.5-397b-a17b', { input: 0.6, output: 3.6, audio: true, reasoning: true }),
  llm('qwen', 'qwen3.5-plus', { input: 0.4, output: 2.4, reasoning: true }),
  llm('qwen', 'qwen3.6-27b', { input: 0.6, output: 3.6, audio: true, reasoning: true }),
  llm('qwen', 'qwen3.6-35b-a3b', { input: 0.248, output: 1.485, audio: true, reasoning: true }),
  llm('qwen', 'qwen3.6-flash', { input: 0.1875, output: 1.125, cachedWrite: 0.234375, reasoning: true }),
  llm('qwen', 'qwen3.6-max-preview', { input: 1.3, output: 7.8, cachedRead: 0.13, cachedWrite: 1.625, reasoning: true }),
  llm('qwen', 'qwen3.6-plus', { input: 0.5, output: 3, cachedRead: 0.05, cachedWrite: 0.625, reasoning: true }),
  llm('qwen', 'qwen3.7-max', { input: 2.5, output: 7.5, cachedRead: 0.5, cachedWrite: 3.125, reasoning: true }),
  llm('qwen', 'qwen3.7-plus', { input: 0.5, output: 3, cachedRead: 0.05, cachedWrite: 0.625, reasoning: true }),
  llm('qwen', 'qwen3.8-flash', { input: 0.15, output: 0.47, cachedRead: 0.016, cachedWrite: 0.2, reasoning: true }),
  llm('qwen', 'qwen3.8-max', { input: 2, output: 6, cachedRead: 0.25, cachedWrite: 2.5, reasoning: true }),
  llm('qwen', 'qwq-plus', { input: 0.8, output: 2.4, reasoning: true }),
  // moonshot (4)
  llm('moonshot', 'kimi-k2.6', { input: 0.95, output: 4, cachedRead: 0.16, reasoning: true }),
  llm('moonshot', 'kimi-k2.7-code', { input: 0.95, output: 4, cachedRead: 0.19, reasoning: true }),
  llm('moonshot', 'kimi-k2.7-code-highspeed', { input: 1.9, output: 8, cachedRead: 0.38, reasoning: true }),
  llm('moonshot', 'kimi-k3', { input: 3, output: 15, cachedRead: 0.3, reasoning: true }),
  // zhipu (15)
  llm('zhipu', 'glm-4.5', { input: 0.6, output: 2.2, cachedRead: 0.11, cachedWrite: 0, reasoning: true }),
  llm('zhipu', 'glm-4.5-air', { input: 0.2, output: 1.1, cachedRead: 0.03, cachedWrite: 0, reasoning: true }),
  llm('zhipu', 'glm-4.5v', { input: 0.6, output: 1.8, reasoning: true }),
  llm('zhipu', 'glm-4.6', { input: 0.6, output: 2.2, cachedRead: 0.11, cachedWrite: 0, reasoning: true }),
  llm('zhipu', 'glm-4.6v', { input: 0.3, output: 0.9, reasoning: true }),
  llm('zhipu', 'glm-4.7', { input: 0.6, output: 2.2, cachedRead: 0.11, cachedWrite: 0, reasoning: true }),
  llm('zhipu', 'glm-4.7-flashx', { input: 0.07, output: 0.4, cachedRead: 0.01, cachedWrite: 0, reasoning: true }),
  llm('zhipu', 'glm-5', { input: 1, output: 3.2, cachedRead: 0.2, cachedWrite: 0, reasoning: true }),
  llm('zhipu', 'glm-5.1', { input: 1.4, output: 4.4, cachedRead: 0.26, cachedWrite: 0, reasoning: true }),
  llm('zhipu', 'glm-5.2', { input: 1.4, output: 4.4, cachedRead: 0.26, cachedWrite: 0, reasoning: true }),
  llm('zhipu', 'glm-5.3', { input: 1.4, output: 4.4, cachedRead: 0.26, cachedWrite: 0, reasoning: true }),
  llm('zhipu', 'glm-5.3-flash', { input: 0.075, output: 0.25, cachedRead: 0.015, cachedWrite: 0, reasoning: true }),
  llm('zhipu', 'glm-5v-turbo', { input: 5, output: 22, cachedRead: 1.2, cachedWrite: 0, audio: true, reasoning: true }),
  llm('zhipu', 'zai-glm-5-2', { input: 1.4, output: 4.4, cachedRead: 0.14, reasoning: true }),
  llm('zhipu', 'zai-glm-5-3', { input: 1.4, output: 4.4, cachedRead: 0.14, reasoning: true }),
  // xai (7)
  llm('xai', 'grok-4.20-0309-non-reasoning', { input: 1.25, output: 2.5, cachedRead: 0.2 }),
  llm('xai', 'grok-4.20-0309-reasoning', { input: 1.25, output: 2.5, cachedRead: 0.2, reasoning: true }),
  llm('xai', 'grok-4.20-multi-agent-0309', { input: 1.25, output: 2.5, cachedRead: 0.2, reasoning: true }),
  llm('xai', 'grok-4.3', { input: 1.25, output: 2.5, cachedRead: 0.2, reasoning: true }),
  llm('xai', 'grok-4.5', { input: 2, output: 6, cachedRead: 0.3, reasoning: true }),
  llm('xai', 'grok-4.6', { input: 2, output: 6, cachedRead: 0.5, reasoning: true }),
  llm('xai', 'grok-build-0.1', { input: 1, output: 2, cachedRead: 0.2, reasoning: true }),
  // meta (5)
  llm('meta', 'muse-spark-1.1', { input: 1.25, output: 4.25, cachedRead: 0.15, reasoning: true }),
  llm('meta', 'muse-spark-1.2', { input: 1.25, output: 4.25, cachedRead: 0.15, audio: true, reasoning: true }),
  llm('meta', 'muse-spark-1.2-contributor', { input: 0.1, output: 0.2, cachedRead: 0.002, audio: true, reasoning: true }),
  llm('meta', 'muse-spark-1.3', { input: 1.25, output: 4.25, cachedRead: 0.15, audio: true, reasoning: true }),
  llm('meta', 'muse-spark-1.3-contributor', { input: 0.1, output: 0.2, cachedRead: 0.002, audio: true, reasoning: true }),
  // mistral (30)
  llm('mistral', 'codestral-latest', { input: 0.3, output: 0.9 }),
  llm('mistral', 'devstral-2512', { input: 0.4, output: 2 }),
  llm('mistral', 'devstral-latest', { input: 0.4, output: 2 }),
  llm('mistral', 'devstral-medium-2507', { input: 0.4, output: 2 }),
  llm('mistral', 'devstral-medium-latest', { input: 0.4, output: 2 }),
  llm('mistral', 'devstral-small-2505', { input: 0.1, output: 0.3 }),
  llm('mistral', 'devstral-small-2507', { input: 0.1, output: 0.3 }),
  llm('mistral', 'magistral-medium-latest', { input: 2, output: 5, reasoning: true }),
  llm('mistral', 'magistral-small', { input: 0.5, output: 1.5, reasoning: true }),
  llm('mistral', 'ministral-3b-latest', { input: 0.04, output: 0.04 }),
  llm('mistral', 'ministral-8b-latest', { input: 0.1, output: 0.1 }),
  embedding('mistral', 'mistral-embed', 0.1),
  llm('mistral', 'mistral-large-2411', { input: 2, output: 6 }),
  llm('mistral', 'mistral-large-2512', { input: 0.5, output: 1.5 }),
  llm('mistral', 'mistral-large-latest', { input: 0.5, output: 1.5 }),
  llm('mistral', 'mistral-medium-2505', { input: 0.4, output: 2 }),
  llm('mistral', 'mistral-medium-2508', { input: 0.4, output: 2 }),
  llm('mistral', 'mistral-medium-2604', { input: 1.5, output: 7.5, reasoning: true }),
  llm('mistral', 'mistral-medium-latest', { input: 1.5, output: 7.5, reasoning: true }),
  llm('mistral', 'mistral-nemo', { input: 0.15, output: 0.15 }),
  llm('mistral', 'mistral-small-2506', { input: 0.1, output: 0.3 }),
  llm('mistral', 'mistral-small-2603', { input: 0.15, output: 0.6, reasoning: true }),
  llm('mistral', 'mistral-small-latest', { input: 0.15, output: 0.6, reasoning: true }),
  llm('mistral', 'open-mistral-7b', { input: 0.25, output: 0.25 }),
  llm('mistral', 'open-mistral-nemo', { input: 0.15, output: 0.15 }),
  llm('mistral', 'open-mixtral-8x22b', { input: 2, output: 6 }),
  llm('mistral', 'open-mixtral-8x7b', { input: 0.7, output: 0.7 }),
  llm('mistral', 'pixtral-12b', { input: 0.15, output: 0.15 }),
  llm('mistral', 'pixtral-large-latest', { input: 2, output: 6 }),
  llm('mistral', 'voxtral-small-latest', { input: 0.1, output: 0.3, audio: true }),
  // minimax (7)
  llm('minimax', 'minimax-m2', { input: 0.3, output: 1.2, reasoning: true }),
  llm('minimax', 'minimax-m2.1', { input: 0.3, output: 1.2, cachedRead: 0.03, cachedWrite: 0.375, reasoning: true }),
  llm('minimax', 'minimax-m2.5', { input: 0.3, output: 1.2, cachedRead: 0.03, cachedWrite: 0.375, reasoning: true }),
  llm('minimax', 'minimax-m2.5-highspeed', { input: 0.6, output: 2.4, cachedRead: 0.06, cachedWrite: 0.375, reasoning: true }),
  llm('minimax', 'minimax-m2.7', { input: 0.3, output: 1.2, cachedRead: 0.06, cachedWrite: 0.375, reasoning: true }),
  llm('minimax', 'minimax-m2.7-highspeed', { input: 0.6, output: 2.4, cachedRead: 0.06, cachedWrite: 0.375, reasoning: true }),
  llm('minimax', 'minimax-m3', { input: 0.3, output: 1.2, cachedRead: 0.06, reasoning: true }),
  // stepfun (5)
  llm('stepfun', 'step-1-32k', { input: 2.05, output: 9.59, cachedRead: 0.41 }),
  llm('stepfun', 'step-2-16k', { input: 5.21, output: 16.44, cachedRead: 1.04 }),
  llm('stepfun', 'step-3.5-flash', { input: 0.1, output: 0.3, cachedRead: 0.02, reasoning: true }),
  llm('stepfun', 'step-3.5-flash-2603', { input: 0.1, output: 0.3, cachedRead: 0.02, reasoning: true }),
  llm('stepfun', 'step-3.7-flash', { input: 0.185, output: 1.11, cachedRead: 0.037, reasoning: true }),
  // cohere (9)
  llm('cohere', 'command-a-03-2025', { input: 2.5, output: 10 }),
  llm('cohere', 'command-a-plus-05-2026', { input: 2.5, output: 10, reasoning: true }),
  llm('cohere', 'command-a-reasoning-08-2025', { input: 2.5, output: 10, reasoning: true }),
  llm('cohere', 'command-a-translate-08-2025', { input: 2.5, output: 10 }),
  llm('cohere', 'command-a-vision-07-2025', { input: 2.5, output: 10 }),
  llm('cohere', 'command-r-08-2024', { input: 0.15, output: 0.6 }),
  llm('cohere', 'command-r-plus-08-2024', { input: 2.5, output: 10 }),
  llm('cohere', 'command-r7b-12-2024', { input: 0.0375, output: 0.15 }),
  llm('cohere', 'command-r7b-arabic-02-2025', { input: 0.0375, output: 0.15 }),
  // ai21 (2)
  llm('ai21', 'jamba-large', { input: 2, output: 8 }),
  llm('ai21', 'jamba-mini', { input: 0.2, output: 0.4 }),
  // perplexity (4)
  llm('perplexity', 'sonar', { input: 1, output: 1 }),
  llm('perplexity', 'sonar-deep-research', { input: 2, output: 8, reasoning: true }),
  llm('perplexity', 'sonar-pro', { input: 3, output: 15 }),
  llm('perplexity', 'sonar-reasoning-pro', { input: 2, output: 8, reasoning: true }),
  // upstage (4)
  llm('upstage', 'solar-mini', { input: 0.15, output: 0.15 }),
  llm('upstage', 'solar-pro2', { input: 0.25, output: 0.25, reasoning: true }),
  llm('upstage', 'solar-pro3', { input: 0.25, output: 0.25, reasoning: true }),
  llm('upstage', 'solar-pro4', { input: 0.3, output: 1.2, cachedRead: 0.06, reasoning: true }),
  // inception (3)
  llm('inception', 'mercury-2', { input: 0.25, output: 0.75, cachedRead: 0.025, reasoning: true }),
  llm('inception', 'mercury-2.5', { input: 0.04, output: 0.15, cachedRead: 0.004, reasoning: true }),
  llm('inception', 'mercury-edit-2', { input: 0.25, output: 0.75, cachedRead: 0.025 }),

];
