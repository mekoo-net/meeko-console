import { fail, ok, type AppResult } from '@/shared/api/httpTypes';
import { clientPaginate } from '@/shared/composables/usePagination';
import { delay } from '@/shared/lib/delay';

import {
  rateSchema,
  upsertRateInputSchema,
  type ListRateFilter,
  type ListVendorModelGroupsFilter,
  type Rate,
  type UnconfiguredRoutePage,
  type UpsertRateInput,
  type VendorModelGroup,
  type VendorModelGroupedPage,
  type VendorRateStatsMap,
} from '@demux/common';
import type { DemuxRatePort, ListRatePage } from '../ports/demuxRatePort';

import { genRateUid, getDemuxStore } from './data';

function parseRate(v: unknown): AppResult<Rate> {
  const r = rateSchema.safeParse(v);
  return r.success ? ok(r.data) : fail({ code: 'validation', message: 'Rate 格式错误' });
}

function applyFilter(rows: Rate[], f: ListRateFilter): Rate[] {
  const kw = f.keyword.trim().toLowerCase();
  return rows.filter((p) => {
    if (kw && !p.modelId.toLowerCase().includes(kw)) return false;
    if (f.billingType !== 'all' && p.billingType !== f.billingType) return false;
    return true;
  });
}

/**
 * 校验 upsert 入参形状。
 *
 * 95% 的字段约束（含 discriminated union shape、tiers 唯一性、非负数等）已经在
 * `upsertRateInputSchema` 里通过 zod 表达。
 */
function validateUpsert(input: UpsertRateInput): AppResult<void> {
  const r = upsertRateInputSchema.safeParse(input);
  if (!r.success) {
    return fail({
      code: 'validation',
      message: r.error.issues[0]?.message ?? '入参不合法',
      details: { errors: r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) },
    });
  }
  return ok(undefined);
}

export class DemuxRateMock implements DemuxRatePort {
  private get store() {
    return getDemuxStore();
  }

  async list(input: {
    page: number;
    pageSize: number;
    filter: ListRateFilter;
  }): Promise<AppResult<ListRatePage>> {
    await delay();
    const sorted = [...this.store.rate].sort((a, b) => a.modelId.localeCompare(b.modelId));
    const filtered = applyFilter(sorted, input.filter);
    const slice = clientPaginate(filtered, input.page, input.pageSize);
    const parsed: Rate[] = [];
    for (const it of slice) {
      const r = parseRate(it);
      if (!r.success) return r;
      parsed.push(r.data);
    }
    return ok({ items: parsed, total: filtered.length });
  }

  async listVendorModelGroups(input: {
    page: number;
    pageSize: number;
    filter: ListVendorModelGroupsFilter;
  }): Promise<AppResult<VendorModelGroupedPage>> {
    await delay();

    const routeMap = new Map<string, { vendorKey: string; vendorModel: string }>();
    for (const route of this.store.vendorRoutes) {
      if (route.isPublished) {
        routeMap.set(route.routeKey, { vendorKey: route.vendorKey, vendorModel: route.vendorModel });
      }
    }

    const groupMap = new Map<string, VendorModelGroup>();
    for (const row of this.store.rate) {
      const route = routeMap.get(row.modelId);
      if (!route) continue;

      const parsed = parseRate(row);
      if (!parsed.success) return parsed;

      const groupKey = `${route.vendorKey}|${route.vendorModel}`;
      let group = groupMap.get(groupKey);
      if (!group) {
        group = {
          vendorKey: route.vendorKey,
          vendorModel: route.vendorModel,
          routeKeys: [],
        };
        groupMap.set(groupKey, group);
      }
      group.routeKeys.push({ routeKey: row.modelId, rate: parsed.data });
    }

    let groups = [...groupMap.values()].map((g) => ({
      ...g,
      routeKeys: [...g.routeKeys].sort((a, b) => a.routeKey.localeCompare(b.routeKey)),
    }));

    const { vendorKey, keyword, billingType } = input.filter;
    if (vendorKey !== 'all') {
      groups = groups.filter((g) => g.vendorKey === vendorKey);
    }
    if (billingType !== 'all') {
      groups = groups
        .map((g) => ({
          ...g,
          routeKeys: g.routeKeys.filter((a) => a.rate.billingType === billingType),
        }))
        .filter((g) => g.routeKeys.length > 0);
    }

    const kw = keyword.trim().toLowerCase();
    if (kw) {
      groups = groups
        .map((g) => {
          if (g.vendorModel.toLowerCase().includes(kw)) return g;
          return {
            ...g,
            routeKeys: g.routeKeys.filter((a) => a.routeKey.toLowerCase().includes(kw)),
          };
        })
        .filter((g) => g.routeKeys.length > 0);
    }

    groups.sort(
      (a, b) =>
        a.vendorKey.localeCompare(b.vendorKey) || a.vendorModel.localeCompare(b.vendorModel),
    );

    const slice = clientPaginate(groups, input.page, input.pageSize);
    return ok({ groups: slice, total: groups.length });
  }

  async get(modelId: string): Promise<AppResult<Rate>> {
    await delay();
    const row = this.store.rate.find((p) => p.modelId === modelId);
    if (!row) return fail({ code: 'not_found', message: `定价 ${modelId} 不存在` });
    return parseRate(row);
  }

  async upsert(input: UpsertRateInput): Promise<AppResult<Rate>> {
    await delay();
    const v = validateUpsert(input);
    if (!v.success) return v;

    if (!this.store.models.some((m) => m.modelId === input.modelId)) {
      return fail({
        code: 'validation',
        message: `模型 "${input.modelId}" 不存在，请先确保有 Provider 映射指向它`,
        details: { modelId: ['unknown model'] },
      });
    }

    const t = Date.now();
    const existingIdx = this.store.rate.findIndex((p) => p.modelId === input.modelId);
    if (existingIdx >= 0) {
      const cur = this.store.rate[existingIdx]!;
      const next = {
        ...input,
        id: cur.id,
        updatedAtUtc: t,
        updatedBy: cur.updatedBy ?? null,
      } as Rate;
      const p = parseRate(next);
      if (!p.success) return p;
      this.store.rate[existingIdx] = p.data;
      return ok(p.data);
    }

    const row = {
      ...input,
      id: genRateUid(),
      updatedAtUtc: t,
      updatedBy: null,
    } as Rate;
    const p = parseRate(row);
    if (!p.success) return p;
    this.store.rate.push(p.data);
    return ok(p.data);
  }

  async delete(id: string): Promise<AppResult<void>> {
    await delay();
    const idx = this.store.rate.findIndex((p) => String(p.id) === String(id));
    if (idx < 0) return fail({ code: 'not_found', message: `定价 ${id} 不存在` });
    this.store.rate.splice(idx, 1);
    return ok(undefined);
  }

  async vendorRateStats(): Promise<AppResult<VendorRateStatsMap>> {
    await delay();
    const configured = new Set(this.store.rate.map((p) => p.modelId));
    const map: VendorRateStatsMap = {};
    for (const route of this.store.vendorRoutes) {
      if (!route.isPublished) continue;
      const entry = (map[route.vendorKey] ??= { configured: 0, unconfigured: 0 });
      if (configured.has(route.routeKey)) entry.configured += 1;
      else entry.unconfigured += 1;
    }
    return ok(map);
  }

  async listUnconfiguredRoutes(input: {
    page: number;
    pageSize: number;
    vendorKey: string;
  }): Promise<AppResult<UnconfiguredRoutePage>> {
    await delay();
    const configured = new Set(this.store.rate.map((p) => p.modelId));
    const rows = this.store.vendorRoutes
      .filter(
        (r) =>
          r.isPublished &&
          r.vendorKey === input.vendorKey &&
          !configured.has(r.routeKey),
      )
      .map((r) => ({
        routeKey: r.routeKey,
        vendorKey: r.vendorKey,
        vendorModel: r.vendorModel,
      }))
      .sort((a, b) => a.routeKey.localeCompare(b.routeKey));
    const items = clientPaginate(rows, input.page, input.pageSize);
    return ok({ items, total: rows.length });
  }
}
