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

export class DemuxaiModelHttpAdapter implements DemuxaiModelPort {
  async list(input: {
    page: number;
    pageSize: number;
    filter: ListModelsFilter;
  }): Promise<AppResult<ListModelsPage>> {
    const { page, pageSize, filter } = input;
    const path = filter.keyword ? `${BASE}/search` : BASE;
    const result = await requestDemuxAi<ItemsEnvelope<Model>>(path, {
      query: {
        p: page,
        size: pageSize,
        keyword: filter.keyword || undefined,
      },
    });
    if (!result.success) return result;
    return { success: true, data: { items: result.data.items, total: result.data.total } };
  }

  async get(uid: Uid): Promise<AppResult<Model>> {
    return requestDemuxAi<Model>(`${BASE}/${uid}`);
  }

  async update(uid: Uid, input: UpdateModelInput): Promise<AppResult<Model>> {
    return requestDemuxAi<Model>(BASE, {
      method: 'PUT',
      body: { id: uid, ...input },
    });
  }
}
