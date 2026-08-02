import { fail, ok, type AppResult } from '@/shared/api/httpTypes';
import { clientPaginate } from '@/shared/composables/usePagination';
import type { Uid } from '@/shared/lib/id';
import { delay } from '@/shared/lib/delay';

import {
  vendorRouteSchema,
  type CreateVendorRouteInput,
  type ListVendorRoutesFilter,
  type VendorRoute,
  type VendorRouteStats,
  type UpdateVendorRouteInput,
} from '../../model/vendorRoute.types';
import type { DemuxVendorRoutePort, ListVendorRoutesPage } from '../ports/demuxVendorRoutePort';

import { genVendorRouteUid, getDemuxStore } from './data';

function parseRoute(v: unknown): AppResult<VendorRoute> {
  const r = vendorRouteSchema.safeParse(v);
  return r.success ? ok(r.data) : fail({ code: 'validation', message: '模型路由格式错误' });
}

function applyFilter(rows: VendorRoute[], f: ListVendorRoutesFilter): VendorRoute[] {
  const kw = f.keyword.trim().toLowerCase();
  return rows.filter((r) => {
    if (f.vendorKey !== 'all' && r.vendorKey !== f.vendorKey) return false;
    if (f.isPublished !== 'all' && r.isPublished !== f.isPublished) return false;
    if (f.vendorModel && r.vendorModel !== f.vendorModel) return false;
    if (
      kw &&
      !r.routeKey.toLowerCase().includes(kw) &&
      !r.vendorModel.toLowerCase().includes(kw) &&
      !r.vendorKey.toLowerCase().includes(kw)
    ) {
      return false;
    }
    return true;
  });
}

export class DemuxVendorRouteMock implements DemuxVendorRoutePort {
  private get store() {
    return getDemuxStore();
  }

  async list(input: {
    page: number;
    pageSize: number;
    filter: ListVendorRoutesFilter;
  }): Promise<AppResult<ListVendorRoutesPage>> {
    await delay();
    const sorted = [...this.store.vendorRoutes].sort((a, b) =>
      a.routeKey.localeCompare(b.routeKey),
    );
    const filtered = applyFilter(sorted, input.filter);
    const slice = clientPaginate(filtered, input.page, input.pageSize);
    const parsed: VendorRoute[] = [];
    for (const it of slice) {
      const r = parseRoute(it);
      if (!r.success) return r;
      parsed.push(r.data);
    }
    return ok({ items: parsed, total: filtered.length });
  }

  async get(uid: Uid): Promise<AppResult<VendorRoute>> {
    await delay();
    const row = this.store.vendorRoutes.find((r) => r.uid === uid);
    if (!row) return fail({ code: 'not_found', message: `路由 ${uid} 不存在` });
    return parseRoute(row);
  }

  async create(input: CreateVendorRouteInput): Promise<AppResult<VendorRoute>> {
    await delay();
    const routeKey = input.routeKey.trim();
    if (!routeKey) return fail({ code: 'validation', message: '请填写对外别名' });
    const taken = this.store.vendorRoutes.some((r) => r.routeKey === routeKey);
    if (taken) {
      return fail({ code: 'conflict', message: `别名「${routeKey}」已存在` });
    }
    const t = Date.now();
    const row: VendorRoute = {
      uid: genVendorRouteUid(),
      routeKey,
      vendorKey: input.vendorKey.trim(),
      vendorModel: input.vendorModel.trim(),
      isPublished: input.isPublished ?? true,
      notes: input.notes?.trim() || null,
      createdAtUtc: t,
      updatedAtUtc: t,
    };
    const p = parseRoute(row);
    if (!p.success) return p;
    this.store.vendorRoutes.unshift(p.data);
    return ok(p.data);
  }

  async update(uid: Uid, input: UpdateVendorRouteInput): Promise<AppResult<VendorRoute>> {
    await delay();
    const idx = this.store.vendorRoutes.findIndex((r) => r.uid === uid);
    if (idx < 0) return fail({ code: 'not_found', message: `路由 ${uid} 不存在` });
    const cur = this.store.vendorRoutes[idx]!;
    const next: VendorRoute = {
      ...cur,
      ...(input.routeKey !== undefined ? { routeKey: input.routeKey.trim() } : {}),
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
    this.store.vendorRoutes[idx] = p.data;
    return ok(p.data);
  }

  async delete(uid: Uid): Promise<AppResult<void>> {
    await delay();
    const idx = this.store.vendorRoutes.findIndex((r) => r.uid === uid);
    if (idx < 0) return fail({ code: 'not_found', message: `路由 ${uid} 不存在` });
    this.store.vendorRoutes.splice(idx, 1);
    return ok(undefined);
  }

  async setPublished(uid: Uid, isPublished: boolean): Promise<AppResult<VendorRoute>> {
    return this.update(uid, { isPublished });
  }

  async stats(vendorKey: string): Promise<AppResult<VendorRouteStats>> {
    await delay();
    const ck = vendorKey.trim();
    const byVendorModel: Record<string, number> = {};
    let total = 0;
    for (const route of this.store.vendorRoutes) {
      if (route.vendorKey !== ck) continue;
      byVendorModel[route.vendorModel] = (byVendorModel[route.vendorModel] ?? 0) + 1;
      total += 1;
    }
    return ok({ vendorKey: ck, total, byVendorModel });
  }
}
