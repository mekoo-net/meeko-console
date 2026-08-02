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
import type {
  DemuxRatePort,
  ListRatePage,
} from '@/features/demux/services/ports/demuxRatePort';
import { requestDemux, type ItemsEnvelope } from '@/features/demux/api/http';
import { demuxPlatformPaths } from '@/features/demux/api/routes';
import { fail, ok, type AppResult } from '@/shared/api/httpTypes';

const BASE = demuxPlatformPaths.adminRate;
const VENDOR_MODEL_BASE = demuxPlatformPaths.adminVendorModel;

/** 新表 vendor_rates 响应 */
interface RateWire {
  id: string | number;
  modelId: string;
  billingType: string;
  rate: unknown;
  multiplier: number;
  currency: string;
  tierMultipliers?: Record<string, number>;
  effectiveFromUtc: string;
  updatedAtUtc: string;
}

function parseRate(value: unknown): AppResult<Rate> {
  const r = rateSchema.safeParse(value);
  return r.success ? ok(r.data) : fail({ code: 'validation', message: '定价格式错误' });
}

function wireToRate(row: RateWire): AppResult<Rate> {
  return parseRate({
    id: row.id,
    modelId: row.modelId,
    billingType: row.billingType,
    rate: row.rate,
    multiplier: row.multiplier,
    currency: row.currency,
    tierMultipliers: row.tierMultipliers ?? {},
    effectiveFromUtc: row.effectiveFromUtc,
    updatedAtUtc: row.updatedAtUtc,
  });
}

function normalizeListRow(row: unknown): AppResult<Rate> | null {
  if (!row || typeof row !== 'object') return null;
  const r = row as Record<string, unknown>;
  if (typeof r.modelId === 'string' && r.modelId.trim()) {
    return wireToRate(row as RateWire);
  }
  return null;
}

type VendorModelGroupedWire = Record<
  string,
  Record<string, Array<{ routeKey: string; rate: unknown }>>
>;

function flattenVendorModelGroups(items: VendorModelGroupedWire): AppResult<VendorModelGroup[]> {
  const groups: VendorModelGroup[] = [];
  const vendorKeys = Object.keys(items).sort();
  for (const vendorKey of vendorKeys) {
    const models = items[vendorKey];
    if (!models) continue;
    const vendorModels = Object.keys(models).sort();
    for (const vendorModel of vendorModels) {
      const entries = models[vendorModel] ?? [];
      const routeKeys: VendorModelGroup['routeKeys'] = [];
      for (const entry of entries) {
        const parsed = wireToRate(entry.rate as RateWire);
        if (!parsed.success) return parsed;
        routeKeys.push({ routeKey: entry.routeKey, rate: parsed.data });
      }
      if (routeKeys.length > 0) {
        groups.push({ vendorKey, vendorModel, routeKeys });
      }
    }
  }
  return ok(groups);
}


export class DemuxRateHttpAdapter implements DemuxRatePort {
  async list(input: {
    page: number;
    pageSize: number;
    filter: ListRateFilter;
  }): Promise<AppResult<ListRatePage>> {
    const { page, pageSize, filter } = input;
    const result = await requestDemux<ItemsEnvelope<unknown>>(BASE, {
      query: {
        p: page,
        pageSize,
        keyword: filter.keyword || undefined,
      },
    });
    if (!result.success) return result;

    const parsed: Rate[] = [];
    for (const row of result.data.items ?? []) {
      const p = normalizeListRow(row);
      if (!p) continue;
      if (!p.success) return p;
      if (filter.billingType !== 'all' && p.data.billingType !== filter.billingType) continue;
      parsed.push(p.data);
    }
    return ok({ items: parsed, total: result.data.total ?? parsed.length });
  }

  async listVendorModelGroups(input: {
    page: number;
    pageSize: number;
    filter: ListVendorModelGroupsFilter;
  }): Promise<AppResult<VendorModelGroupedPage>> {
    const { page, pageSize, filter } = input;
    const result = await requestDemux<{
      items?: VendorModelGroupedWire;
      total?: number;
    }>(VENDOR_MODEL_BASE, {
      query: {
        page,
        pageSize,
        vendorKey: filter.vendorKey === 'all' ? undefined : filter.vendorKey,
        keyword: filter.keyword || undefined,
        billingType: filter.billingType === 'all' ? undefined : filter.billingType,
      },
    });
    if (!result.success) return result;

    const flattened = flattenVendorModelGroups(result.data.items ?? {});
    if (!flattened.success) return flattened;
    return ok({
      groups: flattened.data,
      total: result.data.total ?? flattened.data.length,
    });
  }

  async get(modelId: string): Promise<AppResult<Rate>> {
    const result = await requestDemux<unknown>(`${BASE}/get`, {
      query: { modelId },
    });
    if (!result.success) return result;
    const normalized = normalizeListRow(result.data);
    if (!normalized?.success) {
      return fail({ code: 'not_found', message: `定价 ${modelId} 不存在` });
    }
    return normalized;
  }

  async upsert(input: UpsertRateInput): Promise<AppResult<Rate>> {
    const v = upsertRateInputSchema.safeParse(input);
    if (!v.success) {
      return fail({
        code: 'validation',
        message: v.error.issues[0]?.message ?? '入参不合法',
      });
    }

    const result = await requestDemux<unknown>(BASE, {
      method: 'PUT',
      body: input,
    });
    if (!result.success) return result;
    const normalized = normalizeListRow(result.data);
    if (!normalized?.success) {
      return fail({ code: 'validation', message: '保存响应格式错误' });
    }
    return normalized;
  }

  async delete(id: string): Promise<AppResult<void>> {
    return requestDemux<void>(`${BASE}/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  }

  async vendorRateStats(): Promise<AppResult<VendorRateStatsMap>> {
    const result = await requestDemux<Record<string, { configured?: number; unconfigured?: number }>>(
      `${VENDOR_MODEL_BASE}/stats`,
    );
    if (!result.success) return result;
    const map: VendorRateStatsMap = {};
    for (const [key, entry] of Object.entries(result.data ?? {})) {
      map[key] = {
        configured: entry.configured ?? 0,
        unconfigured: entry.unconfigured ?? 0,
      };
    }
    return ok(map);
  }

  async listUnconfiguredRoutes(input: {
    page: number;
    pageSize: number;
    vendorKey: string;
  }): Promise<AppResult<UnconfiguredRoutePage>> {
    const result = await requestDemux<ItemsEnvelope<{
      routeKey?: string;
      vendorKey?: string;
      vendorModel?: string;
    }>>(`${VENDOR_MODEL_BASE}/unconfigured`, {
      query: {
        page: input.page,
        pageSize: input.pageSize,
        vendorKey: input.vendorKey,
      },
    });
    if (!result.success) return result;
    return ok({
      items: (result.data.items ?? []).map((row) => ({
        routeKey: row.routeKey ?? '',
        vendorKey: row.vendorKey ?? '',
        vendorModel: row.vendorModel ?? '',
      })),
      total: result.data.total ?? 0,
    });
  }
}
