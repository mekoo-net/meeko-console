import { z } from 'zod';

import { requestToApi } from '@/features/toapi/api/http';
import { toapiPaths } from '@/features/toapi/api/routes';
import {
  modelRateSchema,
  supplyGroupSchema,
  type ModelRate,
  type PublishModelRateInput,
  type SupplyGroup,
  type UpsertSupplyGroupInput,
} from '@/features/toapi/model/pricing.types';
import {
  discoverVendorsResultSchema,
  importVendorResultSchema,
  vendorModelSchema,
  type DiscoverVendorsResult,
  type ImportVendorInput,
  type ImportVendorResult,
  type VendorModel,
} from '@/features/toapi/model/vendor.types';
import type { ToApiPricingPort } from '@/features/toapi/services/ports/toapiPricingPort';
import { fail, ok, type AppResult } from '@/shared/api/httpTypes';

function parseWith<T>(schema: z.ZodType<T>, value: unknown, what: string): AppResult<T> {
  const r = schema.safeParse(value);
  return r.success ? ok(r.data) : fail({ code: 'validation', message: `${what}响应格式错误` });
}

export class ToApiPricingHttpAdapter implements ToApiPricingPort {
  async listGroups(): Promise<AppResult<SupplyGroup[]>> {
    const res = await requestToApi<unknown>(toapiPaths.pricingGroups);
    if (!res.success) return res;
    return parseWith(z.array(supplyGroupSchema), res.data ?? [], '供应分组');
  }

  async upsertGroup(input: UpsertSupplyGroupInput): Promise<AppResult<SupplyGroup>> {
    const res = await requestToApi<unknown>(toapiPaths.pricingGroups, {
      method: 'PUT',
      body: {
        key: input.key.trim(),
        name: input.name.trim(),
        status: input.status,
        sortOrder: input.sortOrder,
        notes: input.notes?.trim() || null,
      },
    });
    if (!res.success) return res;
    return parseWith(supplyGroupSchema, res.data, '供应分组');
  }

  async disableGroup(key: string): Promise<AppResult<void>> {
    const res = await requestToApi<unknown>(`${toapiPaths.pricingGroups}/${encodeURIComponent(key)}`, {
      method: 'DELETE',
    });
    return res.success ? ok(undefined) : res;
  }

  /**
   * 由 Meeko.ToApi 控制面完成：读运行时侧 Consul KV 里网关发布的 provider catalog（与 Meeko.Yomi
   * `ConsulGatewayDiscoveryClient` 同一来源），再对照自己的分组 / 模型表标出 alreadyImported。
   * 控制台不直连 OneApi.Gateway，Meeko.Gateway 也看不到运行时侧 Consul。
   */
  async discoverVendors(): Promise<AppResult<DiscoverVendorsResult>> {
    const res = await requestToApi<unknown>(`${toapiPaths.pricingVendors}/discovery`);
    if (!res.success) return res;
    return parseWith(discoverVendorsResultSchema, res.data, '供应商发现');
  }

  async listVendorModels(vendorKey?: string): Promise<AppResult<VendorModel[]>> {
    const path = vendorKey
      ? `${toapiPaths.pricingVendors}/${encodeURIComponent(vendorKey)}/models`
      : `${toapiPaths.pricingVendors}/models`;
    const res = await requestToApi<unknown>(path);
    if (!res.success) return res;
    return parseWith(z.array(vendorModelSchema), res.data ?? [], '供应商模型');
  }

  async importVendor(input: ImportVendorInput): Promise<AppResult<ImportVendorResult>> {
    const res = await requestToApi<unknown>(`${toapiPaths.pricingVendors}/import`, {
      method: 'POST',
      body: {
        vendorKey: input.vendorKey,
        name: input.name?.trim() || null,
        models: input.models.map((vendorModel) => ({ vendorModel })),
      },
    });
    if (!res.success) return res;
    return parseWith(importVendorResultSchema, res.data, '接入');
  }

  async removeVendorModel(vendorKey: string, modelId: string): Promise<AppResult<void>> {
    const res = await requestToApi<unknown>(
      `${toapiPaths.pricingVendors}/${encodeURIComponent(vendorKey)}/models/${encodeURIComponent(modelId)}`,
      { method: 'DELETE' },
    );
    return res.success ? ok(undefined) : res;
  }

  async listRates(input: { groupKey?: string; history: boolean }): Promise<AppResult<ModelRate[]>> {
    const res = await requestToApi<unknown>(toapiPaths.pricingRates, {
      query: { group: input.groupKey, history: input.history },
    });
    if (!res.success) return res;
    return parseWith(z.array(modelRateSchema), res.data ?? [], '定价行');
  }

  async publishRate(input: PublishModelRateInput): Promise<AppResult<ModelRate>> {
    const res = await requestToApi<unknown>(toapiPaths.pricingRates, {
      method: 'POST',
      body: {
        groupKey: input.groupKey,
        modelId: input.modelId.trim(),
        billingType: input.billingType,
        rate: input.rate,
        meta: input.meta,
        effectiveFromUtc: input.effectiveFromUtc,
      },
    });
    if (!res.success) return res;
    return parseWith(modelRateSchema, res.data, '定价行');
  }

  async retireRate(groupKey: string, modelId: string): Promise<AppResult<void>> {
    const res = await requestToApi<unknown>(
      `${toapiPaths.pricingRates}/${encodeURIComponent(groupKey)}/${encodeURIComponent(modelId)}`,
      { method: 'DELETE' },
    );
    return res.success ? ok(undefined) : res;
  }
}
