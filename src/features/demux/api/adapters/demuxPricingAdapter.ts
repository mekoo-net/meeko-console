import {
  PRICE_CURRENCY,
  compareMakers,
  inferMaker,
  modelPriceSchema,
  normalizeMaker,
  rateBodySchema,
  upsertModelPriceInputSchema,
  type ApplyPricesInput,
  type FetchCandidate,
  type FetchPriceItem,
  type FetchPricesInput,
  type FetchPricesResult,
  type ModelPrice,
  type ModelPriceMakerGroup,
  type ModelPriceWriteResult,
  type PriceCompileResult,
  type RoutePricingMode,
  type UpsertModelPriceInput,
} from '@demux/common';
import type { DemuxPricingPort } from '@/features/demux/services/ports/demuxPricingPort';
import { requestDemux, type ItemsEnvelope } from '@/features/demux/api/http';
import { demuxPlatformPaths } from '@/features/demux/api/routes';
import { fail, ok, type AppResult } from '@/shared/api/httpTypes';

const BASE = demuxPlatformPaths.adminPricing;

// ---- wire 形状 ------------------------------------------------------------------

interface ModelPriceWire {
  id: string | number;
  modelKey: string;
  /** 旧后端不下发时按键推断。 */
  maker?: string | null;
  billingType: string;
  rate: unknown;
  currency: string;
  capabilities?: { audio?: boolean; reasoning?: boolean; embedding?: boolean } | null;
  source: string;
  sourceRef?: string | null;
  fetchedAtUtc?: number | null;
  effectiveFromUtc: number;
}

/** `GET /catalog/by-maker` 的一组。 */
interface MakerGroupWire {
  maker: string;
  items?: ModelPriceWire[];
}

interface CompileResultWire {
  compiled?: number;
  unchanged?: number;
  unmatchedModelKeys?: string[];
  newVersion?: number | null;
}

interface FetchCandidateWire {
  sourceKind: string;
  sourceName: string;
  sourceRef: string;
  maker?: string | null;
  modelId: string;
  matchKind: string;
  billingType: string;
  /** 已折成 CNY。 */
  rate: unknown;
  sourceCurrency?: string;
  fxApplied?: number;
  sameAsCurrent: boolean;
  capabilities?: { audio?: boolean; reasoning?: boolean; embedding?: boolean } | null;
}

interface FetchItemWire {
  modelKey: string;
  maker?: string | null;
  current: ModelPriceWire | null;
  candidates: FetchCandidateWire[];
}

interface FetchResultWire {
  sources: Array<{
    kind: string;
    name: string;
    ok: boolean;
    error: string | null;
    candidateCount: number;
    elapsedMs: number;
  }>;
  items: FetchItemWire[];
  fetchedAtUtc: number;
}

// ---- 解析 ----------------------------------------------------------------------

function parseModelPrice(row: ModelPriceWire): AppResult<ModelPrice> {
  const r = modelPriceSchema.safeParse({
    id: row.id,
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
    source: row.source,
    sourceRef: row.sourceRef ?? null,
    fetchedAtUtc: row.fetchedAtUtc ?? null,
    effectiveFromUtc: row.effectiveFromUtc,
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
  };
}

/**
 * 候选报价的 `rate` 由后端按本地形状归一，但源数据千奇百怪；
 * 解析失败的候选直接丢掉，不让一条坏数据拖垮整个 diff。
 */
function parseCandidate(w: FetchCandidateWire): FetchCandidate | null {
  const body = rateBodySchema.safeParse({ billingType: w.billingType, rate: w.rate });
  if (!body.success) return null;
  return {
    ...body.data,
    sourceKind: w.sourceKind,
    sourceName: w.sourceName,
    sourceRef: w.sourceRef,
    maker: normalizeMaker(w.maker, w.modelId),
    modelId: w.modelId,
    matchKind: w.matchKind,
    sourceCurrency: w.sourceCurrency ?? PRICE_CURRENCY,
    fxApplied: w.fxApplied ?? 1,
    sameAsCurrent: w.sameAsCurrent,
    capabilities: w.capabilities
      ? {
          audio: w.capabilities.audio === true,
          reasoning: w.capabilities.reasoning === true,
          embedding: w.capabilities.embedding === true,
        }
      : null,
  };
}

function parseFetchItem(w: FetchItemWire): AppResult<FetchPriceItem> {
  let current: ModelPrice | null = null;
  if (w.current) {
    const c = parseModelPrice(w.current);
    if (!c.success) return c;
    current = c.data;
  }
  return ok({
    modelKey: w.modelKey,
    maker: current?.maker ?? normalizeMaker(w.maker, w.modelKey),
    current,
    candidates: (w.candidates ?? [])
      .map(parseCandidate)
      .filter((c): c is FetchCandidate => c !== null),
  });
}

// ---- 适配器 ---------------------------------------------------------------------

export class DemuxPricingHttpAdapter implements DemuxPricingPort {
  async listModelPricesByMaker(input: {
    keyword: string;
    maker?: string | null;
  }): Promise<AppResult<ModelPriceMakerGroup[]>> {
    const res = await requestDemux<ItemsEnvelope<MakerGroupWire>>(`${BASE}/catalog/by-maker`, {
      query: { keyword: input.keyword || undefined, maker: input.maker || undefined },
    });
    if (!res.success) return res;

    const groups: ModelPriceMakerGroup[] = [];
    for (const g of res.data.items ?? []) {
      const items: ModelPrice[] = [];
      for (const row of g.items ?? []) {
        const p = parseModelPrice(row);
        if (!p.success) return p;
        items.push(p.data);
      }
      groups.push({
        maker: g.maker?.trim().toLowerCase() || inferMaker(items[0]?.modelKey ?? ''),
        items: items.sort((a, b) => a.modelKey.localeCompare(b.modelKey)),
      });
    }
    return ok(groups.sort((a, b) => compareMakers(a.maker, b.maker)));
  }

  async getModelPrice(modelKey: string): Promise<AppResult<ModelPrice>> {
    const res = await requestDemux<ModelPriceWire>(
      `${BASE}/catalog/${encodeURIComponent(modelKey)}`,
    );
    if (!res.success) return res;
    return parseModelPrice(res.data);
  }

  async upsertModelPrice(input: UpsertModelPriceInput): Promise<AppResult<ModelPriceWriteResult>> {
    const v = upsertModelPriceInputSchema.safeParse(input);
    if (!v.success) {
      return fail({ code: 'validation', message: v.error.issues[0]?.message ?? '入参不合法' });
    }
    const res = await requestDemux<{ price: ModelPriceWire; compile: CompileResultWire }>(
      `${BASE}/catalog`,
      {
        method: 'PUT',
        body: {
          modelKey: input.modelKey,
          maker: input.maker ?? null,
          billingType: input.billingType,
          rate: input.rate,
          capabilities: input.capabilities ?? null,
          source: input.source ?? 'manual',
          sourceRef: input.sourceRef ?? null,
          reason: input.reason ?? null,
        },
      },
    );
    if (!res.success) return res;
    const price = parseModelPrice(res.data.price);
    if (!price.success) return price;
    return ok({ price: price.data, compile: toCompileResult(res.data.compile) });
  }

  async deleteModelPrice(id: string): Promise<AppResult<void>> {
    return requestDemux<void>(`${BASE}/catalog/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  }

  async setVendorMultiplier(input: {
    vendorId: string;
    multiplier: number;
    reason?: string | null;
  }): Promise<AppResult<PriceCompileResult>> {
    const res = await requestDemux<CompileResultWire>(
      `${BASE}/vendors/${encodeURIComponent(input.vendorId)}/multiplier`,
      { method: 'PATCH', body: { multiplier: input.multiplier, reason: input.reason ?? null } },
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
    const res = await requestDemux<CompileResultWire>(
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
    const res = await requestDemux<CompileResultWire>(`${BASE}/compile`, {
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

  async fetchPrices(input: FetchPricesInput): Promise<AppResult<FetchPricesResult>> {
    const res = await requestDemux<FetchResultWire>(`${BASE}/sync/fetch`, {
      method: 'POST',
      body: {
        sources: input.sources.map((s) => ({
          kind: s.kind,
          baseUrl: s.baseUrl ?? null,
          apiKey: s.apiKey ?? null,
          name: s.name ?? null,
        })),
        makers: input.makers?.length ? input.makers : null,
        modelKeys: input.modelKeys ?? null,
        onlyMatched: input.onlyMatched ?? false,
        timeoutSeconds: input.timeoutSeconds ?? null,
      },
    });
    if (!res.success) return res;
    const items: FetchPriceItem[] = [];
    for (const w of res.data.items ?? []) {
      const p = parseFetchItem(w);
      if (!p.success) return p;
      items.push(p.data);
    }
    return ok({
      sources: (res.data.sources ?? []).map((s) => ({
        kind: s.kind,
        name: s.name,
        ok: s.ok,
        error: s.error ?? null,
        candidateCount: s.candidateCount ?? 0,
        elapsedMs: s.elapsedMs ?? 0,
      })),
      items,
      fetchedAtUtc: res.data.fetchedAtUtc,
    });
  }

  async applyPrices(input: ApplyPricesInput): Promise<AppResult<PriceCompileResult>> {
    const res = await requestDemux<CompileResultWire>(`${BASE}/sync/apply`, {
      method: 'POST',
      body: {
        items: input.items.map((i) => ({
          modelKey: i.modelKey,
          maker: i.maker,
          billingType: i.billingType,
          rate: i.rate,
          sourceKind: i.sourceKind,
          sourceRef: i.sourceRef,
          capabilities: i.capabilities ?? null,
        })),
        reason: input.reason ?? null,
      },
    });
    if (!res.success) return res;
    return ok(toCompileResult(res.data));
  }
}
