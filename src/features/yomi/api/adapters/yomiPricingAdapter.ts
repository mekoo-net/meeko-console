import {
  canonicalizeModelKey,
  modelPriceSchema,
  normalizeMaker,
  type ModelPrice,
  type PriceCompileResult,
  type RoutePricingMode,
} from '@yomi/common';
import type { YomiPricingPort } from '@/features/yomi/services/ports/yomiPricingPort';
import type { VendorPricingMode } from '@/features/yomi/model/catalog.types';
import { requestYomi } from '@/features/yomi/api/http';
import { yomiPlatformPaths } from '@/features/yomi/api/routes';
import { fail, ok, type AppResult } from '@/shared/api/httpTypes';

const BASE = yomiPlatformPaths.adminPricing;

// ---- wire 形状 ------------------------------------------------------------------

/** 价格表的一行：OneApi 发布出来的样子，悠米后端照着转述。没有行号，按 `modelKey` 认行。 */
interface ModelPriceWire {
  modelKey: string;
  maker?: string | null;
  billingType: string;
  rate: unknown;
  currency: string;
  capabilities?: { audio?: boolean; reasoning?: boolean; embedding?: boolean } | null;
  /** 只有分页的目录视图填；单条查询不填。 */
  routeCount?: number;
  updatedAtUtc: number;
}

interface CompileResultWire {
  compiled?: number;
  unchanged?: number;
  unmatchedModelKeys?: string[];
  newVersion?: number | null;
  priceTableEmpty?: boolean;
  invalidPriceKeys?: string[];
}

// ---- 解析 ----------------------------------------------------------------------

function parseModelPrice(row: ModelPriceWire): AppResult<ModelPrice> {
  const r = modelPriceSchema.safeParse({
    modelKey: row.modelKey,
    maker: normalizeMaker(row.maker, row.modelKey),
    billingType: row.billingType,
    rate: row.rate,
    currency: row.currency,
    capabilities: row.capabilities
      ? {
          audio: row.capabilities.audio === true,
          reasoning: row.capabilities.reasoning === true,
          embedding: row.capabilities.embedding === true,
        }
      : null,
    routeCount: row.routeCount ?? 0,
    updatedAtUtc: row.updatedAtUtc,
  });
  return r.success
    ? ok(r.data)
    : fail({ code: 'validation', message: `基准价 ${row.modelKey} 格式错误` });
}

function toCompileResult(w: CompileResultWire | null | undefined): PriceCompileResult {
  return {
    compiled: w?.compiled ?? 0,
    unchanged: w?.unchanged ?? 0,
    unmatchedModelKeys: w?.unmatchedModelKeys ?? [],
    newVersion: w?.newVersion ?? null,
    priceTableEmpty: w?.priceTableEmpty === true,
    invalidPriceKeys: w?.invalidPriceKeys ?? [],
  };
}

// ---- 适配器 ---------------------------------------------------------------------

export class YomiPricingHttpAdapter implements YomiPricingPort {
  async getModelPrice(modelKey: string): Promise<AppResult<ModelPrice>> {
    // JSON 里的模型名带的是真正的 /。先收成价格表的叶子名再放进路径，路径里不再出现斜杠。
    const key = canonicalizeModelKey(modelKey);
    if (!key) return fail({ code: 'not_found', message: `基准价 ${modelKey} 不存在` });
    const res = await requestYomi<ModelPriceWire>(
      `${BASE}/catalog/${encodeURIComponent(key)}`,
    );
    if (!res.success) return res;
    return parseModelPrice(res.data);
  }

  async setVendorPricing(input: {
    vendorId: string;
    mode: VendorPricingMode;
    value: number;
    reason?: string | null;
  }): Promise<AppResult<PriceCompileResult>> {
    const res = await requestYomi<CompileResultWire>(
      `${BASE}/vendors/${encodeURIComponent(input.vendorId)}/pricing`,
      {
        method: 'PATCH',
        body: { mode: input.mode, value: input.value, reason: input.reason ?? null },
      },
    );
    if (!res.success) return res;
    return ok(toCompileResult(res.data));
  }

  async setRoutePricing(input: {
    routeId: string;
    mode: RoutePricingMode;
    multiplier: number | null;
    reason?: string | null;
  }): Promise<AppResult<PriceCompileResult>> {
    const res = await requestYomi<CompileResultWire>(
      `${BASE}/routes/${encodeURIComponent(input.routeId)}`,
      {
        method: 'PATCH',
        body: { mode: input.mode, multiplier: input.multiplier, reason: input.reason ?? null },
      },
    );
    if (!res.success) return res;
    return ok(toCompileResult(res.data));
  }

  async compile(input?: {
    modelKeys?: string[];
    vendorKeys?: string[];
    reason?: string | null;
  }): Promise<AppResult<PriceCompileResult>> {
    const res = await requestYomi<CompileResultWire>(`${BASE}/compile`, {
      method: 'POST',
      body: {
        modelKeys: input?.modelKeys ?? null,
        vendorKeys: input?.vendorKeys ?? null,
        reason: input?.reason ?? null,
      },
    });
    if (!res.success) return res;
    return ok(toCompileResult(res.data));
  }
}
