import {
  llmPlatformSettingsAdminSchema,
  type LlmPipelineAdmin,
  type LlmPlatformModelOption,
  type LlmPlatformSettingsAdmin,
  type UpdateLlmPlatformSettingsInput,
} from '../../model/llmSettings.types';
import type { TavernLlmSettingsPort } from '../ports/tavernLlmSettingsPort';
import { fail, ok, type AppResult } from '@/shared/api/httpTypes';
import { delay } from '@/shared/lib/delay';

// 与线上一致：id 是 `{渠道}/{模型名}`，模型名自己也可能带斜杠。
const MOCK_MODELS: LlmPlatformModelOption[] = [
  { id: 'antigravity/claude-sonnet-4-6', label: 'claude-sonnet-4-6', modalities: ['text'] },
  { id: 'antigravity/gemini-3.8-flash', label: 'gemini-3.8-flash', modalities: ['text', 'vision'] },
  { id: 'antigravity/gemini-4-argon', label: 'gemini-4-argon', modalities: ['text', 'vision'] },
  { id: 'claude/claude-opus-4-6', label: 'claude-opus-4-6', modalities: ['text'] },
  { id: 'claude/claude-opus-5-5', label: 'claude-opus-5-5', modalities: ['text'] },
  { id: 'cmdc/deepseek/deepseek-v4-pro', label: 'deepseek/deepseek-v4-pro', modalities: ['text'] },
  { id: 'cmdc/moonshotai/Kimi-K3', label: 'moonshotai/Kimi-K3', modalities: ['text'] },
  { id: 'factory/gpt-5.4', label: 'gpt-5.4', modalities: ['text'] },
  { id: 'factory/gemini-3.7-flash', label: 'gemini-3.7-flash', modalities: ['text', 'vision'] },
  { id: 'factory/claude-opus-5-5', label: 'claude-opus-5-5', modalities: ['text'] },
  {
    id: 'fireworks/accounts/fireworks/models/qwen3-embedding-8b',
    label: 'accounts/fireworks/models/qwen3-embedding-8b',
    modalities: ['text'],
  },
  { id: 'kiro/claude-opus-4.6', label: 'claude-opus-4.6', modalities: ['text'] },
  { id: 'kiro/claude-opus-5', label: 'claude-opus-5', modalities: ['text'] },
  { id: 'kiro/claude-sonnet-5', label: 'claude-sonnet-5', modalities: ['text'] },
  { id: 'neko/nai-diffusion-5-full', label: 'nai-diffusion-5-full', modalities: ['text'] },
  { id: 'vertex/gemini-2.5-pro', label: 'gemini-2.5-pro', modalities: ['text', 'vision'] },
];

const PIPELINE_DESCRIPTORS: Array<Omit<LlmPipelineAdmin, 'configured'>> = [
  { id: 'dialogue', label: '角色对话', hint: '用户 ↔ 角色的对话回合', purpose: 'chat' },
  { id: 'interaction', label: '角色互动', hint: '角色 ↔ 角色的交互回合', purpose: 'chat' },
  { id: 'wake', label: '自主唤醒', hint: '模型自注册闹钟触发的 agentic 唤醒回合', purpose: 'chat' },
  { id: 'worldLogic', label: '世界逻辑', hint: '世界状态推演、故事世界模拟', purpose: 'chat' },
  { id: 'events', label: '事件推演', hint: '世界事件的分发与推演决策', purpose: 'chat' },
  { id: 'showrunner', label: '总导演', hint: '导演席（系统频道）的回合', purpose: 'chat' },
  { id: 'director', label: '导演决策', hint: '导演-演员多模型编排的导演侧', purpose: 'chat' },
  { id: 'chronicle', label: '纪事生成', hint: '世界多视角纪事', purpose: 'chat' },
  { id: 'timeline', label: '时间线', hint: '世界时间线归纳生成', purpose: 'chat' },
  { id: 'summary', label: '滚动摘要', hint: '窗口外往事压缩为持久摘要', purpose: 'chat' },
  { id: 'vision', label: '图像理解', hint: '识图、多模态输入', purpose: 'vision' },
  { id: 'embeddings', label: '记忆向量化', hint: '记忆检索向量化（RAG）', purpose: 'embedding' },
  { id: 'ranking', label: '检索重排', hint: 'RAG 检索结果重排', purpose: 'ranking' },
];

function buildPipelines(configured: Record<string, string | null>): LlmPipelineAdmin[] {
  return PIPELINE_DESCRIPTORS.map((descriptor) => ({
    ...descriptor,
    configured: configured[descriptor.id] ?? null,
  }));
}

let configured: Record<string, string | null> = {
  dialogue: 'kiro/claude-opus-4.6',
  worldLogic: 'kiro/claude-opus-5',
  showrunner: 'kiro/claude-opus-5',
  // 线上真实存在的旧值：compat 早已拆成按渠道发布，这条 id 不在目录里
  embeddings: 'compat/accounts/fireworks/models/qwen3-embedding-8b',
};

let updatedAtUtc = Date.now();

function snapshot(): LlmPlatformSettingsAdmin {
  return {
    pipelines: buildPipelines(configured),
    updatedAtUtc,
  };
}

function parseSettings(v: unknown): AppResult<LlmPlatformSettingsAdmin> {
  const r = llmPlatformSettingsAdminSchema.safeParse(v);
  return r.success ? ok(r.data) : fail({ code: 'validation', message: 'LLM 管线设置格式错误' });
}

export class TavernLlmSettingsMock implements TavernLlmSettingsPort {
  async get(): Promise<AppResult<LlmPlatformSettingsAdmin>> {
    await delay();
    return ok(snapshot());
  }

  async update(input: UpdateLlmPlatformSettingsInput): Promise<AppResult<LlmPlatformSettingsAdmin>> {
    await delay();
    configured = { ...configured, ...input.pipelines };
    updatedAtUtc = Date.now();
    return ok(snapshot());
  }

  async listCatalog(): Promise<AppResult<LlmPlatformModelOption[]>> {
    await delay();
    return ok(MOCK_MODELS);
  }
}

export function parseTavernLlmSettings(v: unknown): AppResult<LlmPlatformSettingsAdmin> {
  return parseSettings(v);
}
