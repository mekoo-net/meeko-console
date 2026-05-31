import { fail, ok, type AppResult } from '@/shared/api/httpTypes';
import { clientPaginate } from '@/shared/composables/usePagination';
import type { Uid } from '@/shared/lib/id';
import { delay } from '@/shared/lib/delay';

import {
  modelRouteSchema,
  type CreateModelRouteInput,
  type ListModelRoutesFilter,
  type ModelRoute,
  type UpdateModelRouteInput,
} from '../../model/modelRoute.types';
import type { DemuxaiModelRoutePort, ListModelRoutesPage } from '../ports/demuxaiModelRoutePort';

import { genModelRouteUid, getDemuxaiStore } from './data';

function parseRoute(v: unknown): AppResult<ModelRoute> {
  const r = modelRouteSchema.safeParse(v);
  return r.success ? ok(r.data) : fail({ code: 'validation', message: '模型路由格式错误' });
}

function applyFilter(rows: ModelRoute[], f: ListModelRoutesFilter): ModelRoute[] {
  const kw = f.keyword.trim().toLowerCase();
  return rows.filter((r) => {
    if (f.channelKey !== 'all' && r.channelKey !== f.channelKey) return false;
    if (f.status !== 'all' && r.status !== f.status) return false;
    if (
      kw &&
      !r.alias.toLowerCase().includes(kw) &&
      !r.upstreamModelId.toLowerCase().includes(kw) &&
      !r.channelKey.toLowerCase().includes(kw)
    ) {
      return false;
    }
    return true;
  });
}

export class DemuxaiModelRouteMock implements DemuxaiModelRoutePort {
  private get store() {
    return getDemuxaiStore();
  }

  async list(input: {
    page: number;
    pageSize: number;
    filter: ListModelRoutesFilter;
  }): Promise<AppResult<ListModelRoutesPage>> {
    await delay();
    const sorted = [...this.store.modelRoutes].sort((a, b) =>
      a.alias.localeCompare(b.alias),
    );
    const filtered = applyFilter(sorted, input.filter);
    const slice = clientPaginate(filtered, input.page, input.pageSize);
    const parsed: ModelRoute[] = [];
    for (const it of slice) {
      const r = parseRoute(it);
      if (!r.success) return r;
      parsed.push(r.data);
    }
    return ok({ items: parsed, total: filtered.length });
  }

  async get(uid: Uid): Promise<AppResult<ModelRoute>> {
    await delay();
    const row = this.store.modelRoutes.find((r) => r.uid === uid);
    if (!row) return fail({ code: 'not_found', message: `路由 ${uid} 不存在` });
    return parseRoute(row);
  }

  async create(input: CreateModelRouteInput): Promise<AppResult<ModelRoute>> {
    await delay();
    const alias = input.alias.trim();
    if (!alias) return fail({ code: 'validation', message: '请填写对外别名' });
    const t = Date.now();
    const row: ModelRoute = {
      uid: genModelRouteUid(),
      alias,
      channelKey: input.channelKey.trim(),
      upstreamModelId: input.upstreamModelId.trim(),
      weight: input.weight ?? 100,
      priority: input.priority ?? 100,
      status: input.status ?? 'enabled',
      notes: input.notes?.trim() || null,
      createdAtUtc: t,
      updatedAtUtc: t,
    };
    const p = parseRoute(row);
    if (!p.success) return p;
    this.store.modelRoutes.unshift(p.data);
    return ok(p.data);
  }

  async update(uid: Uid, input: UpdateModelRouteInput): Promise<AppResult<ModelRoute>> {
    await delay();
    const idx = this.store.modelRoutes.findIndex((r) => r.uid === uid);
    if (idx < 0) return fail({ code: 'not_found', message: `路由 ${uid} 不存在` });
    const cur = this.store.modelRoutes[idx]!;
    const next: ModelRoute = {
      ...cur,
      ...(input.alias !== undefined ? { alias: input.alias.trim() } : {}),
      ...(input.channelKey !== undefined ? { channelKey: input.channelKey.trim() } : {}),
      ...(input.upstreamModelId !== undefined
        ? { upstreamModelId: input.upstreamModelId.trim() }
        : {}),
      ...(input.weight !== undefined ? { weight: input.weight } : {}),
      ...(input.priority !== undefined ? { priority: input.priority } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.notes !== undefined ? { notes: input.notes?.trim() || null } : {}),
      updatedAtUtc: Date.now(),
    };
    const p = parseRoute(next);
    if (!p.success) return p;
    this.store.modelRoutes[idx] = p.data;
    return ok(p.data);
  }

  async delete(uid: Uid): Promise<AppResult<void>> {
    await delay();
    const idx = this.store.modelRoutes.findIndex((r) => r.uid === uid);
    if (idx < 0) return fail({ code: 'not_found', message: `路由 ${uid} 不存在` });
    this.store.modelRoutes.splice(idx, 1);
    return ok(undefined);
  }

  async setStatus(uid: Uid, status: ModelRoute['status']): Promise<AppResult<ModelRoute>> {
    return this.update(uid, { status });
  }
}
