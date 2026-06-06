import {
  referralSettingsAdminSchema,
  type ReferralProductRate,
  type ReferralSettingsAdmin,
  type UpdateReferralSettingsInput,
} from '@/features/settings/model/settings.types';
import type { ReferralSettingsPort } from '@/features/settings/services/ports/referralSettingsPort';
import { fail, ok, type AppResult } from '@/shared/api/httpTypes';
import { request } from '@/shared/api/httpClient';
import { asEpochMillis } from '@/shared/lib/epoch';

const BASE = '/api/admin/platform/referral/setting';

function numberOr(a: unknown, b: unknown, fallback: number): number {
  if (typeof a === 'number') return a;
  if (typeof b === 'number') return b;
  return fallback;
}

function mapProductRates(value: unknown): ReferralProductRate[] {
  const rows = Array.isArray(value) ? value : [];
  const result: ReferralProductRate[] = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const raw = row as Record<string, unknown>;
    const code = String(raw.productCode ?? raw.product_code ?? '');
    if (!code) continue;
    result.push({
      productCode: code,
      productName: String(raw.productName ?? raw.product_name ?? code),
      enabled: Boolean(raw.enabled ?? true),
      rebateRatePercent: numberOr(raw.rebateRatePercent, raw.rebate_rate_percent, 0),
      minWithdrawAmount: numberOr(raw.minWithdrawAmount, raw.min_withdraw_amount, 0),
      withdrawReviewRequired:
        typeof raw.withdrawReviewRequired === 'boolean'
          ? raw.withdrawReviewRequired
          : typeof raw.withdraw_review_required === 'boolean'
            ? raw.withdraw_review_required
            : false,
    });
  }
  return result;
}

function parseSettings(value: unknown): AppResult<ReferralSettingsAdmin> {
  if (!value || typeof value !== 'object') {
    return fail({ code: 'validation', message: '返利设置数据格式错误' });
  }
  const raw = value as Record<string, unknown>;
  const mapped = {
    productRates: mapProductRates(raw.productRates ?? raw.product_rates),
    updatedAtUtc: asEpochMillis(raw.updatedAtUtc ?? raw.updated_at_utc) ?? Date.now(),
  };
  const r = referralSettingsAdminSchema.safeParse(mapped);
  return r.success
    ? ok(r.data)
    : fail({
        code: 'validation',
        message: '返利设置数据格式错误',
        details: r.error.flatten().fieldErrors as Record<string, string[]>,
      });
}

export class ReferralSettingsHttpAdapter implements ReferralSettingsPort {
  async get(): Promise<AppResult<ReferralSettingsAdmin>> {
    const res = await request<unknown>(BASE);
    if (!res.success) return res;
    return parseSettings(res.data);
  }

  async update(input: UpdateReferralSettingsInput): Promise<AppResult<ReferralSettingsAdmin>> {
    const res = await request<unknown>(BASE, { method: 'PUT', body: input });
    if (!res.success) return res;
    return parseSettings(res.data);
  }
}
