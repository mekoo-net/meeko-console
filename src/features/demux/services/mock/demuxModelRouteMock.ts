import { fail, ok, type AppResult } from '@/shared/api/httpTypes';
import { clientPaginate } from '@/shared/composables/usePagination';
import type { Uid } from '@/shared/lib/id';
import { delay } from '@/shared/lib/delay';

import {
  modelRouteSchema,
  type CreateModelRouteInput,
  type ListModelRoutesFilter,
  type ModelRoute,
  type ModelRouteStats,
  type UpdateModelRouteInput,
} from '../../model/modelRoute.types';
import type { DemuxModelRoutePort, ListModelRoutesPage } from '../ports/demuxModelRoutePort';

import { genModelRouteUid, getDemuxStore } from './data';

function parseRoute(v: unknown): AppResult<ModelRoute> {
  const r = modelRouteSchema.safeParse(v);
  return r.success ? ok(r.data) : fail({ code: 'validation', message: '模型路由格式错误' });
}

function applyFilter(rows: ModelRoute[], f: ListModelRoutesFilter): ModelRoute[] {
  const kw = f.keyword.trim().toLowerCase();
  return rows.filter((r) => {
    if (f.vendorKey !== 'all' && r.vendorKey !== f.vendorKey) return false;
    if (f.isPublished !== 'all' && r.isPublished !== f.isPublished) return false;
    if (f.vendorModel && r.vendorModel !== f.vendorModel) return false;
    if (
      kw &&
      !r.alias.toLowerCase().includes(kw) &&
      !r.vendorModel.toLowerCase().includes(kw) &&
      !r.vendorKey.toLowerCase().includes(kw)
    ) {
      return false;
    }
    return true;
  });
}

export class DemuxModelRouteMock implements DemuxModelRoutePort {
  private get store() {
    return getDemuxStore();
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
    const taken = this.store.modelRoutes.some((r) => r.alias === alias);
    if (taken) {
      return fail({ code: 'conflict', message: `别名「${alias}」已存在` });
    }
    const t = Date.now();
    const row: ModelRoute = {
      uid: genModelRouteUid(),
      alias,
      vendorKey: input.vendorKey.trim(),
      vendorModel: input.vendorModel.trim(),
      isPublished: input.isPublished ?? true,
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
      ...(input.vendorKey !== undefined ? { vendorKey: input.vendorKey.trim() } : {}),
      ...(input.vendorModel !== undefined
        ? { vendorModel: input.vendorModel.trim() }
        : {}),
      ...(input.isPublished !== undefined ? { isPublished: input.isPublished } : {}),
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

  async setPublished(uid: Uid, isPublished: boolean): Promise<AppResult<ModelRoute>> {
    return this.update(uid, { isPublished });
  }

  async stats(vendorKey: string): Promise<AppResult<ModelRouteStats>> {
    await delay();
    const ck = vendorKey.trim();
    const byVendorModel: Record<string, number> = {};
    let total = 0;
    for (const route of this.store.modelRoutes) {
      if (route.vendorKey !== ck) continue;
      byVendorModel[route.vendorModel] = (byVendorModel[route.vendorModel] ?? 0) + 1;
      total += 1;
    }
    return ok({ vendorKey: ck, total, byVendorModel });
  }
}
