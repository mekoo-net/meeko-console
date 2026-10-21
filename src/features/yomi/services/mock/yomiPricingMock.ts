import { fail, ok, type AppResult } from '@/shared/api/httpTypes';
import { delay } from '@/shared/lib/delay';

import {
  MODEL_PRICE_CURRENCY,
  PRICE_CURRENCY,
  canonicalizeModelKey,
  compareMakers,
  findBestModelKey,
  modelKeyMatches,
  modelPriceSchema,
  normalizeMaker,
  upsertModelPriceInputSchema,
  type ApplyPricesInput,
  type FetchCandidate,
  type FetchPricesInput,
  type FetchPricesResult,
  type ModelPrice,
  type ModelPriceMakerGroup,
  type ModelPriceWriteResult,
  type PriceCompileResult,
  type Rate,
  type RateBody,
  type RoutePricingMode,
  type UpsertModelPriceInput,
} from '@yomi/common';
import type { YomiPricingPort } from '../ports/yomiPricingPort';

import { genModelPriceUid, genRateUid, getYomiStore, type YomiStore } from './data';
import {
  OFFICIAL_USD_PRICES,
  officialUsdCapabilities,
  officialUsdRateBody,
  scaleRateBody,
} from './officialUsdPrices';

function normalizeModelKey(v: string): string {
  return canonicalizeModelKey(v) || v.trim().toLowerCase();
}

function sameBody(a: RateBody, b: RateBody): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Mock 版编译器：基准价(USD) × 渠道倍率 → store.rate（CNY）。不再另乘 7。
 * 只处理 Compiled 路由；Manual 路由的有效价原样保留。
 */
function compile(
  store: YomiStore,
  scope: { modelKeys?: string[]; vendorKeys?: string[]; routeIds?: string[] },
): PriceCompileResult {
  const mk = scope.modelKeys?.map(normalizeModelKey);
  const vk = scope.vendorKeys?.map((v) => v.trim().toLowerCase());
  const rids = scope.routeIds ? new Set(scope.routeIds) : null;

  const priceKeys = store.modelPrices.map((p) => p.modelKey);
  const vendorMult = new Map(store.providerGroups.map((g) => [g.queueGroup, g.priceMultiplier]));

  let compiled = 0;
  let unchanged = 0;
  const unmatched = new Set<string>();
  const t = Date.now();

  for (const route of store.vendorRoutes) {
    if (route.pricingMode !== 'compiled') continue;
    if (rids && !rids.has(route.uid)) continue;
    if (vk && !vk.includes(route.vendorKey)) continue;
    if (mk && !mk.some((k) => modelKeyMatches(route.vendorModel, k))) continue;

    const best = findBestModelKey(route.vendorModel, priceKeys);
    const price = best ? store.modelPrices.find((p) => p.modelKey === best) : undefined;
    if (!price) {
      unmatched.add(normalizeModelKey(route.vendorModel));
      continue;
    }

    const multiplier = (vendorMult.get(route.vendorKey) ?? 1) * (route.priceMultiplier ?? 1);
    const body = scaleRateBody(
      { billingType: price.billingType, rate: price.rate } as RateBody,
      multiplier,
    );

    const idx = store.rate.findIndex((r) => r.modelId === route.routeKey);
    const current = idx >= 0 ? store.rate[idx]! : null;
    if (
      current &&
      current.currency === PRICE_CURRENCY &&
      sameBody({ billingType: current.billingType, rate: current.rate } as RateBody, body)
    ) {
      unchanged += 1;
      continue;
    }

    const next = {
      ...body,
      id: current?.id ?? genRateUid(),
      modelId: route.routeKey,
      currency: PRICE_CURRENCY,
      effectiveFromUtc: t,
      updatedAtUtc: t,
      updatedBy: null,
      sourcePriceId: price.id,
      multiplierApplied: multiplier,
    } as Rate;
    if (idx >= 0) store.rate[idx] = next;
    else store.rate.push(next);
    compiled += 1;
  }

  return {
    compiled,
    unchanged,
    unmatchedModelKeys: [...unmatched].sort(),
    newVersion: compiled > 0 ? Math.floor(t / 1000) : null,
  };
}

export class YomiPricingMock implements YomiPricingPort {
  private get store() {
    return getYomiStore();
  }

  async listModelPricesByMaker(input: {
    keyword: string;
    maker?: string | null;
  }): Promise<AppResult<ModelPriceMakerGroup[]>> {
    await delay();
    const kw = input.keyword.trim().toLowerCase();
    const only = input.maker?.trim().toLowerCase() || null;

    const groups = new Map<string, ModelPriceMakerGroup>();
    for (const p of this.store.modelPrices) {
      if (kw && !p.modelKey.includes(kw)) continue;
      if (only && p.maker !== only) continue;
      let g = groups.get(p.maker);
      if (!g) groups.set(p.maker, (g = { maker: p.maker, items: [] }));
      g.items.push(p);
    }

    for (const g of groups.values()) g.items.sort((a, b) => a.modelKey.localeCompare(b.modelKey));
    return ok([...groups.values()].sort((a, b) => compareMakers(a.maker, b.maker)));
  }

  async getModelPrice(modelKey: string): Promise<AppResult<ModelPrice>> {
    await delay();
    const row = this.store.modelPrices.find((p) => p.modelKey === normalizeModelKey(modelKey));
    if (!row) return fail({ code: 'not_found', message: `基准价 ${modelKey} 不存在` });
    return ok(row);
  }

  async upsertModelPrice(input: UpsertModelPriceInput): Promise<AppResult<ModelPriceWriteResult>> {
    await delay();
    const v = upsertModelPriceInputSchema.safeParse(input);
    if (!v.success) {
      return fail({ code: 'validation', message: v.error.issues[0]?.message ?? '入参不合法' });
    }
    const written = this.writePrice(input);
    if (!written.success) return written;
    const compileResult = compile(this.store, { modelKeys: [written.data.modelKey] });
    return ok({ price: written.data, compile: compileResult });
  }

  private writePrice(input: UpsertModelPriceInput): AppResult<ModelPrice> {
    const modelKey = normalizeModelKey(input.modelKey);
    const t = Date.now();
    const idx = this.store.modelPrices.findIndex((p) => p.modelKey === modelKey);
    const official = OFFICIAL_USD_PRICES.find((r) => r.modelKey === modelKey);
    const parsed = modelPriceSchema.safeParse({
      id: idx >= 0 ? this.store.modelPrices[idx]!.id : genModelPriceUid(),
      modelKey,
      maker: normalizeMaker(input.maker, modelKey),
      billingType: input.billingType,
      rate: input.rate,
      currency: MODEL_PRICE_CURRENCY,
      // 模型能力跟着目录走：改价不动它，新加的键能在目录里查到就带上。
      capabilities:
        idx >= 0
          ? this.store.modelPrices[idx]!.capabilities ?? null
          : (input.capabilities ??
            (official ? officialUsdCapabilities(official) : null)),
      // 自己填的价没有来源可标：清成空串，页面上那一行来源就不显示。
      source: input.source ?? '',
      sourceRef: input.sourceRef ?? null,
      fetchedAtUtc: null,
      effectiveFromUtc: t,
    });
    if (!parsed.success) return fail({ code: 'validation', message: '基准价格式错误' });
    if (idx >= 0) this.store.modelPrices[idx] = parsed.data;
    else this.store.modelPrices.push(parsed.data);
    return ok(parsed.data);
  }

  async deleteModelPrice(id: string): Promise<AppResult<void>> {
    await delay();
    const idx = this.store.modelPrices.findIndex((p) => p.id === id);
    if (idx < 0) return fail({ code: 'not_found', message: `基准价 ${id} 不存在` });
    this.store.modelPrices.splice(idx, 1);
    return ok(undefined);
  }

  async setVendorMultiplier(input: {
    vendorId: string;
    multiplier: number;
  }): Promise<AppResult<PriceCompileResult>> {
    await delay();
    const g = this.store.providerGroups.find((x) => x.id === input.vendorId);
    if (!g) return fail({ code: 'not_found', message: '供应商组不存在' });
    if (input.multiplier < 0 || input.multiplier > 1000) {
      return fail({ code: 'validation', message: '倍率须在 [0, 1000] 内' });
    }
    g.priceMultiplier = input.multiplier;
    g.updatedAtUtc = Date.now();
    return ok(compile(this.store, { vendorKeys: [g.queueGroup] }));
  }

  async setRoutePricing(input: {
    routeId: string;
    mode: RoutePricingMode;
    multiplier: number | null;
  }): Promise<AppResult<PriceCompileResult>> {
    await delay();
    const r = this.store.vendorRoutes.find((x) => x.uid === input.routeId);
    if (!r) return fail({ code: 'not_found', message: '路由不存在' });
    if (input.multiplier != null && (input.multiplier < 0 || input.multiplier > 1000)) {
      return fail({ code: 'validation', message: '倍率须在 [0, 1000] 内' });
    }
    r.pricingMode = input.mode;
    r.priceMultiplier = input.multiplier;
    r.updatedAtUtc = Date.now();
    if (input.mode === 'manual') {
      return ok({ compiled: 0, unchanged: 0, unmatchedModelKeys: [], newVersion: null });
    }
    return ok(compile(this.store, { routeIds: [r.uid] }));
  }

  async compile(input?: {
    modelKeys?: string[];
    vendorKeys?: string[];
  }): Promise<AppResult<PriceCompileResult>> {
    await delay();
    return ok(compile(this.store, { modelKeys: input?.modelKeys, vendorKeys: input?.vendorKeys }));
  }

  /**
   * 官方价：直接回放固化的 models.dev 快照（美元），价格表不折人民币。
   * 所以 mock 里同步出来的结果与目录一致——差异只出在种子里被改过价的那几条。
   */
  async fetchPrices(input: FetchPricesInput): Promise<AppResult<FetchPricesResult>> {
    await delay(400);
    const t = Date.now();
    const priced = new Map(this.store.modelPrices.map((p) => [p.modelKey, p]));

    let catalog = OFFICIAL_USD_PRICES.slice();
    if (input.makers?.length) {
      const only = new Set(input.makers.map((m) => m.trim().toLowerCase()));
      catalog = catalog.filter((r) => only.has(r.maker));
    }
    if (input.modelKeys?.length) {
      const only = new Set(input.modelKeys.map(normalizeModelKey));
      catalog = catalog.filter((r) => only.has(r.modelKey));
    }

    const items = catalog.map((row) => {
      const current = priced.get(row.modelKey) ?? null;
      const body = officialUsdRateBody(row);
      const candidates: FetchCandidate[] = input.sources.map((s) => ({
        ...body,
        sourceKind: s.kind,
        sourceName: s.name ?? s.kind,
        sourceRef: `${s.kind}:${row.maker}/${row.modelKey}`,
        maker: row.maker,
        modelId: row.modelKey,
        matchKind: 'exact',
        sourceCurrency: 'USD',
        fxApplied: 1,
        sameAsCurrent:
          current != null &&
          current.billingType === body.billingType &&
          sameBody({ billingType: current.billingType, rate: current.rate } as RateBody, body),
      }));
      return { modelKey: row.modelKey, maker: row.maker, current, candidates };
    });

    return ok({
      sources: input.sources.map((s) => ({
        kind: s.kind,
        name: s.name ?? s.kind,
        ok: true,
        error: null,
        candidateCount: items.length,
        elapsedMs: 80,
      })),
      items: input.onlyMatched ? items.filter((it) => it.candidates.length > 0) : items,
      fetchedAtUtc: t,
    });
  }

  async applyPrices(input: ApplyPricesInput): Promise<AppResult<PriceCompileResult>> {
    await delay();
    const keys: string[] = [];
    for (const item of input.items) {
      const w = this.writePrice({
        modelKey: item.modelKey,
        maker: item.maker,
        billingType: item.billingType,
        rate: item.rate,
        source: item.sourceKind,
        sourceRef: item.sourceRef,
      } as UpsertModelPriceInput);
      if (!w.success) return w;
      keys.push(w.data.modelKey);
    }
    return ok(compile(this.store, { modelKeys: keys }));
  }
}
