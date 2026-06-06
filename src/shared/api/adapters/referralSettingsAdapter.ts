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
      rebateRatePercent:
        typeof raw.rebateRatePercent === 'number'
          ? raw.rebateRatePercent
          : typeof raw.rebate_rate_percent === 'number'
            ? raw.rebate_rate_percent
            : 0,
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
    enabled: Boolean(raw.enabled ?? true),
    defaultRebateRatePercent:
      typeof raw.defaultRebateRatePercent === 'number'
        ? raw.defaultRebateRatePercent
        : typeof raw.default_rebate_rate_percent === 'number'
          ? raw.default_rebate_rate_percent
          : 5,
    minWithdrawAmount:
      typeof raw.minWithdrawAmount === 'number'
        ? raw.minWithdrawAmount
        : typeof raw.min_withdraw_amount === 'number'
          ? raw.min_withdraw_amount
          : 10,
    withdrawReviewRequired:
      typeof raw.withdrawReviewRequired === 'boolean'
        ? raw.withdrawReviewRequired
        : typeof raw.withdraw_review_required === 'boolean'
          ? raw.withdraw_review_required
          : true,
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
