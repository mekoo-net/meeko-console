import {
  modelRouteSchema,
  type CreateModelRouteInput,
  type ListModelRoutesFilter,
  type ModelRoute,
  type ModelRouteStats,
  type UpdateModelRouteInput,
} from '@/features/demux/model/modelRoute.types';
import type {
  DemuxModelRoutePort,
  ListModelRoutesPage,
} from '@/features/demux/services/ports/demuxModelRoutePort';
import { requestDemux, type ItemsEnvelope } from '@/features/demux/api/http';
import { demuxPlatformPaths } from '@/features/demux/api/routes';
import { fail, ok, type AppResult } from '@/shared/api/httpTypes';
import type { Uid } from '@/shared/lib/id';

const BASE = demuxPlatformPaths.adminRoutes;

function parseRoute(value: unknown): AppResult<ModelRoute> {
  const r = modelRouteSchema.safeParse(value);
  return r.success ? ok(r.data) : fail({ code: 'validation', message: '模型路由格式错误' });
}

function parseRoutes(value: unknown): AppResult<ModelRoute[]> {
  const envelope = value as ItemsEnvelope<unknown>;
  const parsed: ModelRoute[] = [];
  for (const row of envelope.items ?? []) {
    const r = parseRoute(row);
    if (!r.success) return r;
    parsed.push(r.data);
  }
  return ok(parsed);
}

export class DemuxModelRouteHttpAdapter implements DemuxModelRoutePort {
  async list(input: {
    page: number;
    pageSize: number;
    filter: ListModelRoutesFilter;
  }): Promise<AppResult<ListModelRoutesPage>> {
    const res = await requestDemux<ItemsEnvelope<unknown>>(BASE, {
      query: {
        page: input.page,
        pageSize: input.pageSize,
        keyword: input.filter.keyword || undefined,
        vendorKey: input.filter.vendorKey === 'all' ? undefined : input.filter.vendorKey,
        isPublished:
          input.filter.isPublished === 'all' ? undefined : input.filter.isPublished,
        vendorModel: input.filter.vendorModel || undefined,
      },
    });
    if (!res.success) return res;
    const items = parseRoutes(res.data);
    if (!items.success) return items;
    return ok({
      items: items.data,
      total: res.data.total ?? items.data.length,
    });
  }

  async get(uid: Uid): Promise<AppResult<ModelRoute>> {
    const res = await requestDemux<unknown>(`${BASE}/${encodeURIComponent(uid)}`);
    if (!res.success) return res;
    return parseRoute(res.data);
  }

  async create(input: CreateModelRouteInput): Promise<AppResult<ModelRoute>> {
    const res = await requestDemux<unknown>(BASE, {
      method: 'POST',
      body: {
        alias: input.alias.trim(),
        vendorKey: input.vendorKey.trim(),
        vendorModel: input.vendorModel.trim(),
        isPublished: input.isPublished ?? true,
        notes: input.notes ?? null,
      },
    });
    if (!res.success) return res;
    return parseRoute(res.data);
  }

  async update(uid: Uid, input: UpdateModelRouteInput): Promise<AppResult<ModelRoute>> {
    const res = await requestDemux<unknown>(`${BASE}/${encodeURIComponent(uid)}`, {
      method: 'PUT',
      body: {
        ...(input.alias !== undefined ? { alias: input.alias.trim() } : {}),
        ...(input.vendorKey !== undefined ? { vendorKey: input.vendorKey.trim() } : {}),
        ...(input.vendorModel !== undefined
          ? { vendorModel: input.vendorModel.trim() }
          : {}),
        ...(input.isPublished !== undefined ? { isPublished: input.isPublished } : {}),
        ...(input.notes !== undefined ? { notes: input.notes?.trim() || null } : {}),
      },
    });
    if (!res.success) return res;
    return parseRoute(res.data);
  }

  async delete(uid: Uid): Promise<AppResult<void>> {
    return requestDemux<void>(`${BASE}/${encodeURIComponent(uid)}`, { method: 'DELETE' });
  }

  async setPublished(uid: Uid, isPublished: boolean): Promise<AppResult<ModelRoute>> {
    const res = await requestDemux<unknown>(`${BASE}/${encodeURIComponent(uid)}/published`, {
      method: 'PATCH',
      body: { isPublished },
    });
    if (!res.success) return res;
    return parseRoute(res.data);
  }

  async stats(vendorKey: string): Promise<AppResult<ModelRouteStats>> {
    const res = await requestDemux<{
      vendorKey?: string;
      total?: number;
      byVendorModel?: Record<string, number>;
    }>(`${BASE}/stats`, { query: { vendorKey } });
    if (!res.success) return res;
    return ok({
      vendorKey: res.data.vendorKey ?? vendorKey,
      total: res.data.total ?? 0,
      byVendorModel: res.data.byVendorModel ?? {},
    });
  }
}
