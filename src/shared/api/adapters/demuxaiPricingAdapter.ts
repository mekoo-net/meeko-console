import {
  pricingSchema,
  upsertPricingInputSchema,
  type ListPricingFilter,
  type ListVendorModelGroupsFilter,
  type Pricing,
  type UpsertPricingInput,
  type VendorModelGroup,
  type VendorModelGroupedPage,
} from '@/features/demuxai/model/pricing.types';
import type {
  DemuxaiPricingPort,
  ListPricingPage,
} from '@/features/demuxai/services/ports/demuxaiPricingPort';
import { requestDemuxAi, type ItemsEnvelope } from '@/shared/api/httpClient';
import { fail, ok, type AppResult } from '@/shared/api/httpTypes';

const BASE = '/demuxai/api/admin/pricing';
const VENDOR_MODEL_BASE = '/demuxai/api/admin/vendor/model';

/** 新表 model_pricings 响应 */
interface PricingWire {
  id: string | number;
  modelId: string;
  billingType: string;
  pricing: unknown;
  multiplier: number;
  currency: string;
  tierMultipliers?: Record<string, number>;
  effectiveFromUtc: string;
  updatedAtUtc: string;
}

function parsePricing(value: unknown): AppResult<Pricing> {
  const r = pricingSchema.safeParse(value);
  return r.success ? ok(r.data) : fail({ code: 'validation', message: '定价格式错误' });
}

function wireToPricing(row: PricingWire): AppResult<Pricing> {
  return parsePricing({
    id: row.id,
    modelId: row.modelId,
    billingType: row.billingType,
    pricing: row.pricing,
    multiplier: row.multiplier,
    currency: row.currency,
    tierMultipliers: row.tierMultipliers ?? {},
    effectiveFromUtc: row.effectiveFromUtc,
    updatedAtUtc: row.updatedAtUtc,
  });
}

function normalizeListRow(row: unknown): AppResult<Pricing> | null {
  if (!row || typeof row !== 'object') return null;
  const r = row as Record<string, unknown>;
  if (typeof r.modelId === 'string' && r.modelId.trim()) {
    return wireToPricing(row as PricingWire);
  }
  return null;
}

type VendorModelGroupedWire = Record<
  string,
  Record<string, Array<{ alias: string; pricing: unknown }>>
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
      const aliases: VendorModelGroup['aliases'] = [];
      for (const entry of entries) {
        const parsed = wireToPricing(entry.pricing as PricingWire);
        if (!parsed.success) return parsed;
        aliases.push({ alias: entry.alias, pricing: parsed.data });
      }
      if (aliases.length > 0) {
        groups.push({ vendorKey, vendorModel, aliases });
      }
    }
  }
  return ok(groups);
}


export class DemuxaiPricingHttpAdapter implements DemuxaiPricingPort {
  async list(input: {
    page: number;
    pageSize: number;
    filter: ListPricingFilter;
  }): Promise<AppResult<ListPricingPage>> {
    const { page, pageSize, filter } = input;
    const result = await requestDemuxAi<ItemsEnvelope<unknown>>(BASE, {
      query: {
        p: page,
        pageSize,
        keyword: filter.keyword || undefined,
      },
    });
    if (!result.success) return result;

    const parsed: Pricing[] = [];
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
    const result = await requestDemuxAi<{
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

  async get(modelId: string): Promise<AppResult<Pricing>> {
    const result = await requestDemuxAi<unknown>(`${BASE}/get`, {
      query: { modelId },
    });
    if (!result.success) return result;
    const normalized = normalizeListRow(result.data);
    if (!normalized?.success) {
      return fail({ code: 'not_found', message: `定价 ${modelId} 不存在` });
    }
    return normalized;
  }

  async upsert(input: UpsertPricingInput): Promise<AppResult<Pricing>> {
    const v = upsertPricingInputSchema.safeParse(input);
    if (!v.success) {
      return fail({
        code: 'validation',
        message: v.error.issues[0]?.message ?? '入参不合法',
      });
    }

    const result = await requestDemuxAi<unknown>(BASE, {
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

  async delete(modelId: string): Promise<AppResult<void>> {
    return requestDemuxAi<void>(BASE, {
      method: 'DELETE',
      query: { modelId },
    });
  }
}
