import {
  discoverCatalogResultSchema,
  importProviderGroupResultSchema,
  providerGroupSchema,
  providerUpstreamModelSchema,
  type DiscoverCatalogResult,
  type ImportProviderGroupInput,
  type ImportProviderGroupResult,
  type ProviderGroup,
  type ProviderUpstreamModel,
} from '@/features/demuxai/model/catalog.types';
import type { DemuxaiCatalogPort } from '@/features/demuxai/services/ports/demuxaiCatalogPort';
import { requestDemuxAi, type ItemsEnvelope } from '@/shared/api/httpClient';
import { fail, ok, type AppResult } from '@/shared/api/httpTypes';

const BASE = '/demuxai/api/admin/providers';

function parseGroups(value: unknown): AppResult<ProviderGroup[]> {
  const envelope = value as ItemsEnvelope<unknown>;
  const parsed: ProviderGroup[] = [];
  for (const row of envelope.items ?? []) {
    const r = providerGroupSchema.safeParse(row);
    if (!r.success) return fail({ code: 'validation', message: '供应商组列表格式错误' });
    parsed.push(r.data);
  }
  return ok(parsed.sort((a, b) => a.queueGroup.localeCompare(b.queueGroup)));
}

function parseModels(value: unknown): AppResult<ProviderUpstreamModel[]> {
  const envelope = value as ItemsEnvelope<unknown>;
  const parsed: ProviderUpstreamModel[] = [];
  for (const row of envelope.items ?? []) {
    const r = providerUpstreamModelSchema.safeParse(row);
    if (!r.success) return fail({ code: 'validation', message: '上游模型列表格式错误' });
    parsed.push(r.data);
  }
  return ok(parsed);
}

function parseDiscover(value: unknown): AppResult<DiscoverCatalogResult> {
  const r = discoverCatalogResultSchema.safeParse(value);
  return r.success ? ok(r.data) : fail({ code: 'validation', message: '发现源格式错误' });
}

function parseImport(value: unknown): AppResult<ImportProviderGroupResult> {
  const r = importProviderGroupResultSchema.safeParse(value);
  return r.success ? ok(r.data) : fail({ code: 'validation', message: '导入响应格式错误' });
}

export class DemuxaiCatalogHttpAdapter implements DemuxaiCatalogPort {
  async listProviderGroups(): Promise<AppResult<ProviderGroup[]>> {
    const res = await requestDemuxAi<ItemsEnvelope<unknown>>(`${BASE}/catalog/groups`);
    if (!res.success) return res;
    return parseGroups(res.data);
  }

  async listUpstreamModels(queueGroup: string): Promise<AppResult<ProviderUpstreamModel[]>> {
    const res = await requestDemuxAi<ItemsEnvelope<unknown>>(`${BASE}/${encodeURIComponent(queueGroup)}/models`);
    if (!res.success) return res;
    return parseModels(res.data);
  }

  async discoverFromGateway(): Promise<AppResult<DiscoverCatalogResult>> {
    const res = await requestDemuxAi<unknown>(`${BASE}/discovery`);
    if (!res.success) return res;
    return parseDiscover(res.data);
  }

  async importProviderGroup(
    input: ImportProviderGroupInput,
  ): Promise<AppResult<ImportProviderGroupResult>> {
    const res = await requestDemuxAi<unknown>(`${BASE}/import`, {
      method: 'POST',
      body: {
        queueGroup: input.queueGroup,
        vendorSlug: input.vendorSlug ?? null,
        notes: input.notes ?? null,
        models: input.models.map((m) => ({
          vendorModel: m.vendorModel,
        })),
      },
    });
    if (!res.success) return res;
    return parseImport(res.data);
  }

  async deleteProviderGroup(id: string): Promise<AppResult<void>> {
    return requestDemuxAi<void>(`${BASE}/${encodeURIComponent(id)}`, { method: 'DELETE' });
  }

  async deleteUpstreamModel(queueGroup: string, modelId: string): Promise<AppResult<void>> {
    return requestDemuxAi<void>(
      `${BASE}/${encodeURIComponent(queueGroup)}/models/${encodeURIComponent(modelId)}`,
      { method: 'DELETE' },
    );
  }
}
