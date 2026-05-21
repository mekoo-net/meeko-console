import { formatMoney } from './money';

/** 与 DemuxAi 控制台一致：500_000 quota = 1 美元展示单位；账单兑换码按人民币录入。 */
export const QUOTA_PER_UNIT = 500_000;
const CNY_RATE = 7;

/** 用户输入的展示金额（元）→ 内部 quota 整数。 */
export function displayAmountToQuota(amount: number | string | null | undefined): number {
  const val = Number(amount ?? 0);
  if (!Number.isFinite(val) || val === 0) return 0;
  const sign = Math.sign(val);
  const usd = Math.abs(val) / CNY_RATE;
  return sign * Math.round(usd * QUOTA_PER_UNIT);
}

/** quota → 展示金额（元）。 */
export function quotaToDisplayAmount(quota: number | string | null | undefined): number {
  const q = Number(quota ?? 0);
  if (!Number.isFinite(q) || q === 0) return 0;
  const sign = Math.sign(q);
  const usd = Math.abs(q) / QUOTA_PER_UNIT;
  return sign * usd * CNY_RATE;
}

/** 兑换码额度展示（人民币）。 */
export function formatQuota(quota: number | string | null | undefined): string {
  return formatMoney(quotaToDisplayAmount(quota), { currency: 'CNY' });
}
