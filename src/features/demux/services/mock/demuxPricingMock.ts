import { fail, ok, type AppResult } from '@/shared/api/httpTypes';
import { clientPaginate } from '@/shared/composables/usePagination';
import { delay } from '@/shared/lib/delay';

import {
  pricingSchema,
  upsertPricingInputSchema,
  type ListPricingFilter,
  type ListVendorModelGroupsFilter,
  type Pricing,
  type UnconfiguredAliasPage,
  type UpsertPricingInput,
  type VendorModelGroup,
  type VendorModelGroupedPage,
  type VendorPricingStatsMap,
} from '@demux/common';
import type { DemuxPricingPort, ListPricingPage } from '../ports/demuxPricingPort';

import { genPricingUid, getDemuxStore } from './data';

function parsePricing(v: unknown): AppResult<Pricing> {
  const r = pricingSchema.safeParse(v);
  return r.success ? ok(r.data) : fail({ code: 'validation', message: 'Pricing 格式错误' });
}

function applyFilter(rows: Pricing[], f: ListPricingFilter): Pricing[] {
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
 * `upsertPricingInputSchema` 里通过 zod 表达。
 */
function validateUpsert(input: UpsertPricingInput): AppResult<void> {
  const r = upsertPricingInputSchema.safeParse(input);
  if (!r.success) {
    return fail({
      code: 'validation',
      message: r.error.issues[0]?.message ?? '入参不合法',
      details: { errors: r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) },
    });
  }
  return ok(undefined);
}

export class DemuxPricingMock implements DemuxPricingPort {
  private get store() {
    return getDemuxStore();
  }

  async list(input: {
    page: number;
    pageSize: number;
    filter: ListPricingFilter;
  }): Promise<AppResult<ListPricingPage>> {
    await delay();
    const sorted = [...this.store.pricing].sort((a, b) => a.modelId.localeCompare(b.modelId));
    const filtered = applyFilter(sorted, input.filter);
    const slice = clientPaginate(filtered, input.page, input.pageSize);
    const parsed: Pricing[] = [];
    for (const it of slice) {
      const r = parsePricing(it);
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
    for (const route of this.store.modelRoutes) {
      if (route.isPublished) {
        routeMap.set(route.alias, { vendorKey: route.vendorKey, vendorModel: route.vendorModel });
      }
    }

    const groupMap = new Map<string, VendorModelGroup>();
    for (const row of this.store.pricing) {
      const route = routeMap.get(row.modelId);
      if (!route) continue;

      const parsed = parsePricing(row);
      if (!parsed.success) return parsed;

      const groupKey = `${route.vendorKey}|${route.vendorModel}`;
      let group = groupMap.get(groupKey);
      if (!group) {
        group = {
          vendorKey: route.vendorKey,
          vendorModel: route.vendorModel,
          aliases: [],
        };
        groupMap.set(groupKey, group);
      }
      group.aliases.push({ alias: row.modelId, pricing: parsed.data });
    }

    let groups = [...groupMap.values()].map((g) => ({
      ...g,
      aliases: [...g.aliases].sort((a, b) => a.alias.localeCompare(b.alias)),
    }));

    const { vendorKey, keyword, billingType } = input.filter;
    if (vendorKey !== 'all') {
      groups = groups.filter((g) => g.vendorKey === vendorKey);
    }
    if (billingType !== 'all') {
      groups = groups
        .map((g) => ({
          ...g,
          aliases: g.aliases.filter((a) => a.pricing.billingType === billingType),
        }))
        .filter((g) => g.aliases.length > 0);
    }

    const kw = keyword.trim().toLowerCase();
    if (kw) {
      groups = groups
        .map((g) => {
          if (g.vendorModel.toLowerCase().includes(kw)) return g;
          return {
            ...g,
            aliases: g.aliases.filter((a) => a.alias.toLowerCase().includes(kw)),
          };
        })
        .filter((g) => g.aliases.length > 0);
    }

    groups.sort(
      (a, b) =>
        a.vendorKey.localeCompare(b.vendorKey) || a.vendorModel.localeCompare(b.vendorModel),
    );

    const slice = clientPaginate(groups, input.page, input.pageSize);
    return ok({ groups: slice, total: groups.length });
  }

  async get(modelId: string): Promise<AppResult<Pricing>> {
    await delay();
    const row = this.store.pricing.find((p) => p.modelId === modelId);
    if (!row) return fail({ code: 'not_found', message: `定价 ${modelId} 不存在` });
    return parsePricing(row);
  }

  async upsert(input: UpsertPricingInput): Promise<AppResult<Pricing>> {
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
    const existingIdx = this.store.pricing.findIndex((p) => p.modelId === input.modelId);
    if (existingIdx >= 0) {
      const cur = this.store.pricing[existingIdx]!;
      const next = {
        ...input,
        id: cur.id,
        updatedAtUtc: t,
        updatedBy: cur.updatedBy ?? null,
      } as Pricing;
      const p = parsePricing(next);
      if (!p.success) return p;
      this.store.pricing[existingIdx] = p.data;
      return ok(p.data);
    }

    const row = {
      ...input,
      id: genPricingUid(),
      updatedAtUtc: t,
      updatedBy: null,
    } as Pricing;
    const p = parsePricing(row);
    if (!p.success) return p;
    this.store.pricing.push(p.data);
    return ok(p.data);
  }

  async delete(id: string): Promise<AppResult<void>> {
    await delay();
    const idx = this.store.pricing.findIndex((p) => String(p.id) === String(id));
    if (idx < 0) return fail({ code: 'not_found', message: `定价 ${id} 不存在` });
    this.store.pricing.splice(idx, 1);
    return ok(undefined);
  }

  async vendorPricingStats(): Promise<AppResult<VendorPricingStatsMap>> {
    await delay();
    const configured = new Set(this.store.pricing.map((p) => p.modelId));
    const map: VendorPricingStatsMap = {};
    for (const route of this.store.modelRoutes) {
      if (!route.isPublished) continue;
      const entry = (map[route.vendorKey] ??= { configured: 0, unconfigured: 0 });
      if (configured.has(route.alias)) entry.configured += 1;
      else entry.unconfigured += 1;
    }
    return ok(map);
  }

  async listUnconfiguredAliases(input: {
    page: number;
    pageSize: number;
    vendorKey: string;
  }): Promise<AppResult<UnconfiguredAliasPage>> {
    await delay();
    const configured = new Set(this.store.pricing.map((p) => p.modelId));
    const rows = this.store.modelRoutes
      .filter(
        (r) =>
          r.isPublished &&
          r.vendorKey === input.vendorKey &&
          !configured.has(r.alias),
      )
      .map((r) => ({
        alias: r.alias,
        vendorKey: r.vendorKey,
        vendorModel: r.vendorModel,
      }))
      .sort((a, b) => a.alias.localeCompare(b.alias));
    const items = clientPaginate(rows, input.page, input.pageSize);
    return ok({ items, total: rows.length });
  }
}
