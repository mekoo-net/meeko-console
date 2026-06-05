import { fail, ok, type AppResult } from '@/shared/api/httpTypes';
import { clientPaginate } from '@/shared/composables/usePagination';
import { delay } from '@/shared/lib/delay';

import {
  pricingSchema,
  upsertPricingInputSchema,
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

  async delete(modelId: string): Promise<AppResult<void>> {
    await delay();
    const idx = this.store.pricing.findIndex((p) => p.modelId === modelId);
    if (idx < 0) return fail({ code: 'not_found', message: `定价 ${modelId} 不存在` });
    this.store.pricing.splice(idx, 1);
    return ok(undefined);
  }
}
