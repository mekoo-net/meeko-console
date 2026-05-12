import { fail, ok, type AppResult } from '@/shared/api/httpTypes';
import { clientPaginate } from '@/shared/composables/usePagination';
import { delay } from '@/shared/lib/delay';

import {
  pricingSchema,
  type ListPricingFilter,
  type Pricing,
  type UpsertPricingInput,
} from '../../model/pricing.types';
import type { DemuxaiPricingPort, ListPricingPage } from '../ports/demuxaiPricingPort';

import { genPricingUid, getDemuxaiStore } from './data';

function parsePricing(v: unknown): AppResult<Pricing> {
  const r = pricingSchema.safeParse(v);
  return r.success ? ok(r.data) : fail({ code: 'validation', message: 'Pricing 格式错误' });
}

function applyFilter(rows: Pricing[], f: ListPricingFilter): Pricing[] {
  const kw = f.keyword.trim().toLowerCase();
  return rows.filter((p) => {
    if (kw && !p.modelId.toLowerCase().includes(kw)) return false;
    if (f.mode !== 'all' && p.mode !== f.mode) return false;
    return true;
  });
}

function validateModeFields(input: UpsertPricingInput): AppResult<void> {
  if (input.mode === 'per_token') {
    if (input.inputPricePerKToken == null || input.outputPricePerKToken == null) {
      return fail({
        code: 'validation',
        message: '按 Token 模式必须填 input/output 单价',
        details: { mode: ['per_token requires input & output price'] },
      });
    }
  }
  if (input.mode === 'per_call' && input.pricePerCall == null) {
    return fail({ code: 'validation', message: '按调用模式必须填 pricePerCall' });
  }
  if (input.mode === 'per_image' && input.pricePerImage == null) {
    return fail({ code: 'validation', message: '按图片模式必须填 pricePerImage' });
  }
  if (input.mode === 'per_minute' && input.pricePerMinute == null) {
    return fail({ code: 'validation', message: '按时长模式必须填 pricePerMinute' });
  }
  if (input.multiplier <= 0) {
    return fail({ code: 'validation', message: '倍率必须 > 0' });
  }
  return ok(undefined);
}

export class DemuxaiPricingMock implements DemuxaiPricingPort {
  private get store() {
    return getDemuxaiStore();
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

  async get(modelId: string): Promise<AppResult<Pricing>> {
    await delay();
    const row = this.store.pricing.find((p) => p.modelId === modelId);
    if (!row) return fail({ code: 'not_found', message: `定价 ${modelId} 不存在` });
    return parsePricing(row);
  }

  async upsert(input: UpsertPricingInput): Promise<AppResult<Pricing>> {
    await delay();
    const v = validateModeFields(input);
    if (!v.success) return v;

    if (!this.store.models.some((m) => m.modelId === input.modelId)) {
      return fail({
        code: 'validation',
        message: `模型 "${input.modelId}" 不存在，请先确保有 Provider 映射指向它`,
        details: { modelId: ['unknown model'] },
      });
    }

    const t = new Date().toISOString();
    const existingIdx = this.store.pricing.findIndex((p) => p.modelId === input.modelId);
    if (existingIdx >= 0) {
      const cur = this.store.pricing[existingIdx]!;
      const next: Pricing = {
        ...cur,
        mode: input.mode,
        inputPricePerKToken: input.inputPricePerKToken ?? null,
        outputPricePerKToken: input.outputPricePerKToken ?? null,
        pricePerCall: input.pricePerCall ?? null,
        pricePerImage: input.pricePerImage ?? null,
        pricePerMinute: input.pricePerMinute ?? null,
        multiplier: input.multiplier,
        currency: input.currency,
        tierMultipliers: { ...input.tierMultipliers },
        effectiveFromUtc: input.effectiveFromUtc,
        updatedAtUtc: t,
      };
      const p = parsePricing(next);
      if (!p.success) return p;
      this.store.pricing[existingIdx] = p.data;
      return ok(p.data);
    }

    const row: Pricing = {
      uid: genPricingUid(),
      modelId: input.modelId,
      mode: input.mode,
      inputPricePerKToken: input.inputPricePerKToken ?? null,
      outputPricePerKToken: input.outputPricePerKToken ?? null,
      pricePerCall: input.pricePerCall ?? null,
      pricePerImage: input.pricePerImage ?? null,
      pricePerMinute: input.pricePerMinute ?? null,
      multiplier: input.multiplier,
      currency: input.currency,
      tierMultipliers: { ...input.tierMultipliers },
      effectiveFromUtc: input.effectiveFromUtc,
      updatedAtUtc: t,
      updatedByIamUid: null,
    };
    const p = parsePricing(row);
    if (!p.success) return p;
    this.store.pricing.push(p.data);
    return ok(p.data);
  }

  async delete(modelId: string): Promise<AppResult<void>> {
    await delay();
    const idx = this.store.pricing.findIndex((p) => p.modelId === modelId);
    if (idx < 0) return fail({ code: 'not_found', message: `定价 ${modelId} 不存在` });
    this.store.pricing.splice(idx, 1);
    return ok(undefined);
  }
}
