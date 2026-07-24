import {
  llmPlatformSettingsAdminSchema,
  type LlmPlatformSettingsAdmin,
  type UpdateLlmPlatformSettingsInput,
} from '@/features/tavern/model/llmSettings.types';
import { requestTavern } from '@/features/tavern/api/http';
import type { TavernLlmSettingsPort } from '@/features/tavern/services/ports/tavernLlmSettingsPort';
import { fail, ok, type AppResult } from '@/shared/api/httpTypes';
import { asEpochMillis } from '@/shared/lib/epoch';

const BASE = '/tavern/api/admin/settings/llm';

function mapPipelineWire(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') return raw;
  const w = raw as Record<string, unknown>;
  return {
    id: w.id ?? w.Id ?? '',
    label: w.label ?? w.Label ?? '',
    hint: w.hint ?? w.Hint ?? '',
    purpose: w.purpose ?? w.Purpose ?? 'chat',
    configured: w.configured ?? w.Configured ?? null,
    effective: w.effective ?? w.Effective ?? null,
    candidates: w.candidates ?? w.Candidates ?? [],
  };
}

function mapModelWire(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') return raw;
  const w = raw as Record<string, unknown>;
  return {
    id: w.id ?? w.Id ?? '',
    label: w.label ?? w.Label ?? '',
    modalities: w.modalities ?? w.Modalities ?? [],
  };
}

function mapSettingsWire(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') return raw;
  const w = raw as Record<string, unknown>;
  const pipelinesRaw = w.pipelines ?? w.Pipelines;
  const modelsRaw = w.models ?? w.Models;
  return {
    pipelines: Array.isArray(pipelinesRaw) ? pipelinesRaw.map(mapPipelineWire) : [],
    models: Array.isArray(modelsRaw) ? modelsRaw.map(mapModelWire) : [],
    updatedAtUtc: asEpochMillis(w.updatedAtUtc ?? w.updated_at_utc) ?? Date.now(),
  };
}

function parseSettings(value: unknown): AppResult<LlmPlatformSettingsAdmin> {
  const r = llmPlatformSettingsAdminSchema.safeParse(mapSettingsWire(value));
  return r.success ? ok(r.data) : fail({ code: 'validation', message: 'LLM 管线设置格式错误' });
}

export class TavernLlmSettingsHttpAdapter implements TavernLlmSettingsPort {
  async get(): Promise<AppResult<LlmPlatformSettingsAdmin>> {
    const res = await requestTavern<unknown>(BASE);
    if (!res.success) return res;
    return parseSettings(res.data);
  }

  async update(input: UpdateLlmPlatformSettingsInput): Promise<AppResult<LlmPlatformSettingsAdmin>> {
    const res = await requestTavern<unknown>(BASE, { method: 'PUT', body: input });
    if (!res.success) return res;
    return parseSettings(res.data);
  }
}
