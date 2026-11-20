import { fail, ok, type AppResult } from '@/shared/api/httpTypes';
import { delay } from '@/shared/lib/delay';

import {
  PRICE_CURRENCY,
  canonicalizeModelKey,
  findBestModelKey,
  modelKeyMatches,
  type ModelPrice,
  type PriceCompileResult,
  type Rate,
  type RateBody,
  type RoutePricingMode,
} from '@yomi/common';
import type { YomiPricingPort } from '../ports/yomiPricingPort';
import type { VendorPricingMode } from '../../model/catalog.types';

import { genRateUid, getYomiStore, type YomiStore } from './data';
import { scaleRateBody } from './officialUsdPrices';

function normalizeModelKey(v: string): string {
  return canonicalizeModelKey(v) || v.trim().toLowerCase();
}

function sameBody(a: RateBody, b: RateBody): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Mock 版编译器，与后端同一口径：倍率渠道是基准价(USD) × 渠道倍率 → store.rate（CNY），不再另乘 7；
 * 积分渠道直接编成 per_credit、单价取渠道积分单价，价格表和倍率都不参与。
 * 只处理 Compiled 路由；Manual 路由的有效价原样保留。
 *
 * 价格表是空的（没发布过 / 读不到）时，按牌价出价的路由整条跳过、现有的有效价一个字不动，也不报「无基准价」：
 * 空表说明不了哪个模型缺价。积分渠道不看价格表，照编。
 */
function compile(
  store: YomiStore,
  scope: { modelKeys?: string[]; vendorKeys?: string[]; routeIds?: string[] },
): PriceCompileResult {
  const mk = scope.modelKeys?.map(normalizeModelKey);
  const vk = scope.vendorKeys?.map((v) => v.trim().toLowerCase());
  const rids = scope.routeIds ? new Set(scope.routeIds) : null;

  const priceKeys = store.modelPrices.map((p) => p.modelKey);
  const vendorPricing = new Map(store.providerGroups.map((g) => [g.queueGroup, g]));

  let compiled = 0;
  let unchanged = 0;
  let skippedForEmptyTable = false;
  const unmatched = new Set<string>();
  const t = Date.now();

  for (const route of store.vendorRoutes) {
    if (route.pricingMode !== 'compiled') continue;
    if (rids && !rids.has(route.uid)) continue;
    if (vk && !vk.includes(route.vendorKey)) continue;
    if (mk && !mk.some((k) => modelKeyMatches(route.vendorModel, k))) continue;

    const vendor = vendorPricing.get(route.vendorKey);
    let body: RateBody;
    let sourceModelKey: string | null = null;
    let multiplier: number | null = null;
    if (vendor?.pricingMode === 'credit') {
      // 不找基准价：价格表里没有这条模型也照样定得出价，所以也不会算进 unmatched。
      body = { billingType: 'per_credit', rate: { pricePerCredit: vendor.pricingValue } };
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
      multiplier = (vendor?.pricingValue ?? 1) * (route.priceMultiplier ?? 1);
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

  async setVendorPricing(input: {
    vendorId: string;
    mode: VendorPricingMode;
    value: number;
  }): Promise<AppResult<PriceCompileResult>> {
    await delay();
    const g = this.store.providerGroups.find((x) => x.id === input.vendorId);
    if (!g) return fail({ code: 'not_found', message: '供应商组不存在' });
    // 与后端同一上限：倍率 1000，积分单价 10000，都只拦手滑。
    const max = input.mode === 'credit' ? 10_000 : 1000;
    if (!Number.isFinite(input.value) || input.value < 0 || input.value > max) {
      return fail({ code: 'validation', message: `须在 [0, ${max}] 内` });
    }
    g.pricingMode = input.mode;
    // 后端按 6 位小数落库；mock 也取到 6 位，免得存出后端存不下的数。
    g.pricingValue = Math.round(input.value * 1e6) / 1e6;
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
      return ok({ compiled: 0, unchanged: 0, unmatchedModelKeys: [], newVersion: null, priceTableEmpty: false, invalidPriceKeys: [] });
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
}
