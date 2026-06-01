import {
  modelRouteSchema,
  type CreateModelRouteInput,
  type ListModelRoutesFilter,
  type ModelRoute,
  type UpdateModelRouteInput,
} from '@/features/demuxai/model/modelRoute.types';
import type {
  DemuxaiModelRoutePort,
  ListModelRoutesPage,
} from '@/features/demuxai/services/ports/demuxaiModelRoutePort';
import { requestDemuxAi, type ItemsEnvelope } from '@/shared/api/httpClient';
import { fail, ok, type AppResult } from '@/shared/api/httpTypes';
import type { Uid } from '@/shared/lib/id';

const BASE = '/demuxai/api/admin/routes';

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

export class DemuxaiModelRouteHttpAdapter implements DemuxaiModelRoutePort {
  async list(input: {
    page: number;
    pageSize: number;
    filter: ListModelRoutesFilter;
  }): Promise<AppResult<ListModelRoutesPage>> {
    const res = await requestDemuxAi<ItemsEnvelope<unknown>>(BASE, {
      query: {
        page: input.page,
        pageSize: input.pageSize,
        keyword: input.filter.keyword || undefined,
        vendorKey: input.filter.vendorKey === 'all' ? undefined : input.filter.vendorKey,
        status: input.filter.status === 'all' ? undefined : input.filter.status,
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
    const res = await requestDemuxAi<unknown>(`${BASE}/${encodeURIComponent(uid)}`);
    if (!res.success) return res;
    return parseRoute(res.data);
  }

  async create(input: CreateModelRouteInput): Promise<AppResult<ModelRoute>> {
    const res = await requestDemuxAi<unknown>(BASE, {
      method: 'POST',
      body: {
        alias: input.alias.trim(),
        vendorKey: input.vendorKey.trim(),
        vendorModel: input.vendorModel.trim(),
        weight: input.weight ?? 100,
        priority: input.priority ?? 100,
        status: input.status ?? 'enabled',
        notes: input.notes ?? null,
      },
    });
    if (!res.success) return res;
    return parseRoute(res.data);
  }

  async update(uid: Uid, input: UpdateModelRouteInput): Promise<AppResult<ModelRoute>> {
    const res = await requestDemuxAi<unknown>(`${BASE}/${encodeURIComponent(uid)}`, {
      method: 'PUT',
      body: {
        ...(input.alias !== undefined ? { alias: input.alias.trim() } : {}),
        ...(input.vendorKey !== undefined ? { vendorKey: input.vendorKey.trim() } : {}),
        ...(input.vendorModel !== undefined
          ? { vendorModel: input.vendorModel.trim() }
          : {}),
        ...(input.weight !== undefined ? { weight: input.weight } : {}),
        ...(input.priority !== undefined ? { priority: input.priority } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.notes !== undefined ? { notes: input.notes?.trim() || null } : {}),
      },
    });
    if (!res.success) return res;
    return parseRoute(res.data);
  }

  async delete(uid: Uid): Promise<AppResult<void>> {
    return requestDemuxAi<void>(`${BASE}/${encodeURIComponent(uid)}`, { method: 'DELETE' });
  }

  async setStatus(uid: Uid, status: ModelRoute['status']): Promise<AppResult<ModelRoute>> {
    const res = await requestDemuxAi<unknown>(`${BASE}/${encodeURIComponent(uid)}/status`, {
      method: 'PATCH',
      body: { status },
    });
    if (!res.success) return res;
    return parseRoute(res.data);
  }
}
