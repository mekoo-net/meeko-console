import type { AppResult } from '@/shared/api/httpTypes';
import { requestDemuxAi, type ItemsEnvelope } from '@/shared/api/httpClient';
import type { Uid } from '@/shared/lib/id';

import type {
  ListModelsFilter,
  Model,
  UpdateModelInput,
} from '@/features/demuxai/model/model.types';
import type {
  DemuxaiModelPort,
  ListModelsPage,
} from '@/features/demuxai/services/ports/demuxaiModelPort';

const BASE = '/demuxai/api/admin/models';

/**
 * 后端 ModelMetaAdminDto 字段名与前端 Model schema 存在差异：
 *  - `modelName`  → `modelId`（后端用 modelName，前端 log 查找用 modelId 作 map key）
 *  - `id`         → `uid`（后端返回数值 id，前端统一用 uid string）
 *
 * 若后端已对齐字段名（直接返回 modelId/uid），此映射为无害的 identity。
 */
function mapModel(raw: unknown): Model {
  if (!raw || typeof raw !== 'object') return raw as Model;
  const r = raw as Record<string, unknown>;
  return {
    ...r,
    modelId: r['modelId'] ?? r['modelName'] ?? '',
    uid: r['uid'] ?? (r['id'] != null ? String(r['id']) : ''),
  } as unknown as Model;
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
    return requestDemuxAi<Model>(BASE, {
      method: 'PUT',
      body: { id: uid, ...input },
    });
  }
}
