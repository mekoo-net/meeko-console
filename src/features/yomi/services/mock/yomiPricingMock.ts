import { fail, ok, type AppResult } from '@/shared/api/httpTypes';
import { delay } from '@/shared/lib/delay';

import {
  KNOWN_MAKERS,
  MAKER_OTHER,
  PRICE_CURRENCY,
  canonicalizeModelKey,
  compareMakers,
  familyPricingModeValues,
  findBestModelKey,
  inferMaker,
  modelKeyMatches,
  type FamilyPricingMode,
  type ModelPrice,
  type PriceCompileResult,
  type Rate,
  type RateBody,
  type RoutePricingMode,
  type VendorFamilyPricing,
} from '@yomi/common';
import type { YomiPricingPort } from '../ports/yomiPricingPort';

import { genRateUid, getYomiStore, routePriceSource, type YomiStore } from './data';
import { scaleRateBody } from './officialUsdPrices';

function normalizeModelKey(v: string): string {
  return canonicalizeModelKey(v) || v.trim().toLowerCase();
}

function sameBody(a: RateBody, b: RateBody): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** 后端认的家族键：认识的那几家加 `other`；产品名别名（claude → anthropic）也收。 */
const FAMILY_ALIASES: Readonly<Record<string, string>> = { claude: 'anthropic', gemini: 'google' };

function normalizeFamily(raw: string): string | null {
  const k = raw.trim().toLowerCase();
  const key = FAMILY_ALIASES[k] ?? k;
  return key === MAKER_OTHER || KNOWN_MAKERS.some((m) => m.key === key) ? key : null;
}

/**
 * Mock 版编译器，与后端同一口径（见 data.ts 的 routePriceSource）：别名设了独立倍率就是基准价(USD) × 它 → store.rate（CNY），
 * 不再另乘 7；没设就跟所在模型家族的分组——分组是倍率则乘分组倍率，是按次 / 积分则直接编成 per_call / per_credit，
 * 价格表不参与。渠道自己不管价格。只处理 Compiled 路由；Manual 路由的有效价原样保留。
 *
 * 价格表是空的（没发布过 / 读不到）时，按牌价出价的路由整条跳过、现有的有效价一个字不动，也不报「无基准价」：
 * 空表说明不了哪个模型缺价。继承按次 / 积分分组的不看价格表，照编。
 *
 * 范围跟着改动走：改分组定价只算那个渠道里那个家族，改别名只算那一条。
 */
function compile(
  store: YomiStore,
  scope: { modelKeys?: string[]; vendorKeys?: string[]; routeIds?: string[]; families?: string[] },
): PriceCompileResult {
  const mk = scope.modelKeys?.map(normalizeModelKey);
  const vk = scope.vendorKeys?.map((v) => v.trim().toLowerCase());
  const rids = scope.routeIds ? new Set(scope.routeIds) : null;
  const fams = scope.families ? new Set(scope.families) : null;

  const priceKeys = store.modelPrices.map((p) => p.modelKey);

  let compiled = 0;
  let unchanged = 0;
  let skippedForEmptyTable = false;
  const unmatched = new Set<string>();
  const t = Date.now();

  for (const route of store.vendorRoutes) {
    if (route.pricingMode !== 'compiled') continue;
    if (rids && !rids.has(route.uid)) continue;
    if (vk && !vk.includes(route.vendorKey)) continue;
    if (fams && !fams.has(inferMaker(route.vendorModel))) continue;
    if (mk && !mk.some((k) => modelKeyMatches(route.vendorModel, k))) continue;

    const source = routePriceSource(store.familyPricings, route);
    let body: RateBody;
    let sourceModelKey: string | null = null;
    let multiplier: number | null = null;
    if (source.kind === 'flat') {
      // 不找基准价：价格表里没有这条模型也照样定得出价，所以也不会算进 unmatched。
      body = source.body;
    } else {
      if (priceKeys.length === 0) {
        skippedForEmptyTable = true;
        continue;
      }
      const best = findBestModelKey(route.vendorModel, priceKeys);
      const price = best ? store.modelPrices.find((p) => p.modelKey === best) : undefined;
      if (!price) {
        unmatched.add(normalizeModelKey(route.vendorModel));
        continue;
      }
      multiplier = source.multiplier;
      body = scaleRateBody({ billingType: price.billingType, rate: price.rate } as RateBody, multiplier);
      sourceModelKey = price.modelKey;
    }

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
      sourceModelKey,
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
    priceTableEmpty: skippedForEmptyTable,
    // 种子里的价都是照形状生成的，没有坏行
    invalidPriceKeys: [],
  };
}

/**
 * 价格表是 OneApi 的（在「组件设置 → OneApi → 模型价格」里维护），这里和接了后端一样只能按键查一行；
 * 种子里的那一份就是悠米「收到的」牌价，和模型价格页的 mock 是两份数据，互不相干。
 */
export class YomiPricingMock implements YomiPricingPort {
  private get store() {
    return getYomiStore();
  }

  async getModelPrice(modelKey: string): Promise<AppResult<ModelPrice>> {
    await delay();
    const row = this.store.modelPrices.find((p) => p.modelKey === normalizeModelKey(modelKey));
    if (!row) return fail({ code: 'not_found', message: `基准价 ${modelKey} 不存在` });
    return ok(row);
  }

  async listVendorFamilies(vendorId: string): Promise<AppResult<VendorFamilyPricing[]>> {
    await delay();
    const g = this.store.providerGroups.find((x) => x.id === vendorId);
    if (!g) return fail({ code: 'not_found', message: '供应商组不存在' });

    const rows = new Map<string, VendorFamilyPricing>();
    const row = (family: string): VendorFamilyPricing => {
      let r = rows.get(family);
      if (!r) {
        r = { family, mode: 'multiplier', value: 1, routeCount: 0, inheritingRouteCount: 0 };
        rows.set(family, r);
      }
      return r;
    };
    for (const route of this.store.vendorRoutes) {
      if (route.vendorKey !== g.queueGroup) continue;
      const r = row(inferMaker(route.vendorModel));
      r.routeCount += 1;
      if (route.pricingMode === 'compiled' && route.priceMultiplier == null) r.inheritingRouteCount += 1;
    }
    for (const f of this.store.familyPricings) {
      if (f.vendorKey !== g.queueGroup) continue;
      const r = row(f.family);
      r.mode = f.mode;
      r.value = f.value;
    }
    return ok([...rows.values()].sort((a, b) => compareMakers(a.family, b.family)));
  }

  async setFamilyPricing(input: {
    vendorId: string;
    family: string;
    mode: FamilyPricingMode;
    value: number;
  }): Promise<AppResult<PriceCompileResult>> {
    await delay();
    const g = this.store.providerGroups.find((x) => x.id === input.vendorId);
    if (!g) return fail({ code: 'not_found', message: '供应商组不存在' });
    const family = normalizeFamily(input.family);
    if (!family) return fail({ code: 'validation', message: `不认识的模型家族 ${input.family}` });
    if (!familyPricingModeValues.includes(input.mode)) {
      return fail({ code: 'validation', message: `不认识的定价方式 ${String(input.mode)}` });
    }
    // 与后端同一上限：倍率 1000，按次价 / 积分单价 10000，都只拦手滑。
    const max = input.mode === 'multiplier' ? 1000 : 10_000;
    if (!Number.isFinite(input.value) || input.value < 0 || input.value > max) {
      return fail({ code: 'validation', message: `须在 [0, ${max}] 内` });
    }
    // 后端按 6 位小数落库；mock 也取到 6 位，免得存出后端存不下的数。
    const value = Math.round(input.value * 1e6) / 1e6;
    const existing = this.store.familyPricings.find(
      (f) => f.vendorKey === g.queueGroup && f.family === family,
    );
    if (existing) {
      existing.mode = input.mode;
      existing.value = value;
    } else {
      this.store.familyPricings.push({ vendorKey: g.queueGroup, family, mode: input.mode, value });
    }
    // 与后端同一范围：只重算这个渠道里这个家族的别名，别的家族不碰。
    return ok(compile(this.store, { vendorKeys: [g.queueGroup], families: [family] }));
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
      return ok({ compiled: 0, unchanged: 0, unmatchedModelKeys: [], newVersion: null, priceTableEmpty: false, invalidPriceKeys: [] });
    }
    return ok(compile(this.store, { routeIds: [r.uid] }));
  }
}
