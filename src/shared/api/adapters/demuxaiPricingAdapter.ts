import type { AppResult } from '@/shared/api/httpTypes';
import { requestDemuxAi, type ItemsEnvelope } from '@/shared/api/httpClient';

import type {
  ListPricingFilter,
  Pricing,
  UpsertPricingInput,
} from '@/features/demuxai/model/pricing.types';
import type {
  DemuxaiPricingPort,
  ListPricingPage,
} from '@/features/demuxai/services/ports/demuxaiPricingPort';

const BASE = '/demuxai/api/admin/pricing';

export class DemuxaiPricingHttpAdapter implements DemuxaiPricingPort {
  async list(input: {
    page: number;
    pageSize: number;
    filter: ListPricingFilter;
  }): Promise<AppResult<ListPricingPage>> {
    const { page, pageSize, filter } = input;
    const result = await requestDemuxAi<ItemsEnvelope<Pricing>>(BASE, {
      query: {
        p: page,
        pageSize,
        keyword: filter.keyword || undefined,
      },
    });
    if (!result.success) return result;
    return { success: true, data: { items: result.data.items, total: result.data.total } };
  }

  async get(modelId: string): Promise<AppResult<Pricing>> {
    return requestDemuxAi<Pricing>(`${BASE}/${modelId}`);
  }

  async upsert(input: UpsertPricingInput): Promise<AppResult<Pricing>> {
    const result = await requestDemuxAi<{ uid: string | number }>(`${BASE}/${input.modelId}`, {
      method: 'PUT',
      body: input,
    });
    if (!result.success) return result;
    return this.get(input.modelId);
  }

  async delete(modelId: string): Promise<AppResult<void>> {
    return requestDemuxAi<void>(`${BASE}/${modelId}`, {
      method: 'DELETE',
      query: { groupCode: 'default' },
    });
  }
}
