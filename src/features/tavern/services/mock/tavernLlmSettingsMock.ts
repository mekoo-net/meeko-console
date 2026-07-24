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

const MOCK_MODELS: LlmPlatformModelOption[] = [
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', modalities: ['text'] },
  { id: 'claude-sonnet-4', label: 'Claude Sonnet 4', modalities: ['text'] },
  { id: 'gpt-4o', label: 'GPT-4o', modalities: ['text', 'vision'] },
  { id: 'text-embedding-3-small', label: 'Text Embedding 3 Small', modalities: [] },
  { id: 'bge-reranker-v2', label: 'BGE Reranker v2', modalities: [] },
];

const PIPELINE_DESCRIPTORS: Array<Omit<LlmPipelineAdmin, 'configured' | 'effective' | 'candidates'>> = [
  { id: 'dialogue', label: '角色对话', hint: '用户 ↔ 角色的对话回合', purpose: 'chat' },
  { id: 'interaction', label: '角色互动', hint: '角色 ↔ 角色的交互回合', purpose: 'chat' },
  { id: 'wake', label: '自主唤醒', hint: '模型自注册闹钟触发的 agentic 唤醒回合', purpose: 'chat' },
  { id: 'worldLogic', label: '世界逻辑', hint: '世界状态推演、故事世界模拟', purpose: 'chat' },
  { id: 'events', label: '事件推演', hint: '世界事件的分发与推演决策', purpose: 'chat' },
  { id: 'director', label: '导演决策', hint: '导演-演员多模型编排的导演侧', purpose: 'chat' },
  { id: 'chronicle', label: '纪事生成', hint: '世界多视角纪事', purpose: 'chat' },
  { id: 'timeline', label: '时间线', hint: '世界时间线归纳生成', purpose: 'chat' },
  { id: 'summary', label: '滚动摘要', hint: '窗口外往事压缩为持久摘要', purpose: 'chat' },
  { id: 'vision', label: '图像理解', hint: '识图、多模态输入', purpose: 'vision' },
  { id: 'embeddings', label: '记忆向量化', hint: '记忆检索向量化（RAG）', purpose: 'embedding' },
  { id: 'ranking', label: '检索重排', hint: 'RAG 检索结果重排', purpose: 'ranking' },
];

function candidatesFor(purpose: LlmPipelineAdmin['purpose']): string[] {
  switch (purpose) {
    case 'vision':
      return MOCK_MODELS.filter((m) => m.modalities.includes('vision')).map((m) => m.id);
    case 'embedding':
      return MOCK_MODELS.filter((m) => m.id.includes('embed')).map((m) => m.id);
    case 'ranking':
      return MOCK_MODELS.filter((m) => m.id.includes('rerank')).map((m) => m.id);
    default:
      return MOCK_MODELS.filter((m) => !m.id.includes('embed') && !m.id.includes('rerank')).map((m) => m.id);
  }
}

function resolveEffective(configured: string | null, candidates: string[]): string | null {
  if (configured && candidates.includes(configured)) return configured;
  return candidates[0] ?? null;
}

function buildPipelines(configured: Record<string, string | null>): LlmPipelineAdmin[] {
  return PIPELINE_DESCRIPTORS.map((descriptor) => {
    const candidates = candidatesFor(descriptor.purpose);
    const value = configured[descriptor.id] ?? null;
    return {
      ...descriptor,
      configured: value,
      effective: resolveEffective(value, candidates),
      candidates,
    };
  });
}

let configured: Record<string, string | null> = {
  dialogue: 'gemini-2.5-flash',
  worldLogic: 'claude-sonnet-4',
};

let updatedAtUtc = Date.now();

function snapshot(): LlmPlatformSettingsAdmin {
  return {
    pipelines: buildPipelines(configured),
    models: MOCK_MODELS,
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
}

export function parseTavernLlmSettings(v: unknown): AppResult<LlmPlatformSettingsAdmin> {
  return parseSettings(v);
}
