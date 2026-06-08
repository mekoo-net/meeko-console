import type { AppResult } from '@/shared/api/httpTypes';
import { requestDemuxAi, type ItemsEnvelope } from '@/shared/api/httpClient';
import type { Uid } from '@/shared/lib/id';

import type {
  ListModelsFilter,
  Model,
  ModelCarriersMap,
  ModelCarrierEntry,
  UpdateModelInput,
} from '@/features/demuxai/model/model.types';
import type {
  DemuxaiModelPort,
  ListModelsPage,
} from '@/features/demuxai/services/ports/demuxaiModelPort';

const BASE = '/demuxai/api/admin/models';

/** 后端 ModelMetaWireDto（camelCase）。 */
interface ModelMetaWireRaw {
  id: string | number;
  modelName: string;
  description?: string | null;
  tags?: string | null;
  icon?: string | null;
  vendorId?: string | number | null;
  status?: number | null;
}

/**
 * 后端 wire 与前端 Model schema 字段不完全对齐：
 * wire 仅含 modelName / description / vendorId / status 等元数据，
 * 前端 UI 所需的 family / capabilities 等字段在此补默认值。
 */
function mapModel(raw: unknown): Model {
  if (!raw || typeof raw !== 'object') return raw as Model;
  const r = raw as Record<string, unknown>;
  const modelId = String(r['modelId'] ?? r['modelName'] ?? '');
  const uid = String(r['uid'] ?? r['id'] ?? '');
  const now = Date.now();
  return {
    uid,
    modelId,
    displayName: String(r['displayName'] ?? modelId),
    family: 'gpt',
    capabilities: ['chat'],
    visibleMinTier: 1,
    maxContextTokens: 8192,
    maxOutputTokens: null,
    supportsStreaming: true,
    supportsFunctionCall: false,
    description: typeof r['description'] === 'string' ? r['description'] : null,
    vendorName: typeof r['vendorName'] === 'string' ? r['vendorName'] : undefined,
    createdAtUtc: now,
    updatedAtUtc: now,
  };
}

function toNumericId(value: string | number): number {
  if (typeof value === 'number') return value;
  return Number.parseInt(String(value), 10);
}

export class DemuxaiModelHttpAdapter implements DemuxaiModelPort {
  async list(input: {
    page: number;
    pageSize: number;
    filter: ListModelsFilter;
  }): Promise<AppResult<ListModelsPage>> {
    const { page, pageSize, filter } = input;
    const path = filter.keyword ? `${BASE}/search` : BASE;
    const result = await requestDemuxAi<ItemsEnvelope<unknown>>(path, {
      query: {
        p: page,
        size: pageSize,
        keyword: filter.keyword || undefined,
      },
    });
    if (!result.success) return result;
    const items = (result.data.items as unknown[]).map(mapModel);
    return { success: true, data: { items, total: result.data.total } };
  }

  async get(uid: Uid): Promise<AppResult<Model>> {
    const result = await requestDemuxAi<unknown>(`${BASE}/${uid}`);
    if (!result.success) return result;
    return { success: true, data: mapModel(result.data) };
  }

  async update(uid: Uid, input: UpdateModelInput): Promise<AppResult<Model>> {
    const existing = await requestDemuxAi<ModelMetaWireRaw>(`${BASE}/${uid}`);
    if (!existing.success) return existing;

    const row = existing.data;
    const vendorId = row.vendorId != null ? toNumericId(row.vendorId) : 0;
    const result = await requestDemuxAi<unknown>(BASE, {
      method: 'PUT',
      body: {
        id: toNumericId(row.id),
        modelName: input.displayName?.trim() ?? row.modelName,
        description:
          input.description !== undefined ? input.description : (row.description ?? null),
        tags: row.tags ?? null,
        icon: row.icon ?? null,
        vendorId,
        status: row.status ?? 1,
      },
    });
    if (!result.success) return result;
    return { success: true, data: mapModel(result.data) };
  }

  async carriers(modelIds: string[]): Promise<AppResult<ModelCarriersMap>> {
    if (modelIds.length === 0) return { success: true, data: {} };
    const result = await requestDemuxAi<Record<string, ModelCarrierEntry[]>>(`${BASE}/carriers`, {
      query: { modelIds: modelIds.join(',') },
    });
    if (!result.success) return result;
    return { success: true, data: result.data ?? {} };
  }
}
