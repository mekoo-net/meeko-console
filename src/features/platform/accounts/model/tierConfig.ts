/**
 * 账户等级阈值表。等级由累积充值金额自动计算，详情页只读展示（带升级进度条）。
 *
 * 阈值单位：元（与 WalletSnapshot / RechargeRecord.amount 保持一致；后端长期使用元）。
 * 阈值规则为前后端共识，不入库。新增等级请按 threshold 升序追加。
 */
export interface TierConfig {
  level: number;
  /** 达到该等级所需的累积充值金额（元）。 */
  threshold: number;
  /** 等级展示名。 */
  name: string;
}

export const TIER_THRESHOLDS: readonly TierConfig[] = [
  { level: 1, threshold: 0, name: 'Lv1' },
  { level: 2, threshold: 100, name: 'Lv2' },
  { level: 3, threshold: 500, name: 'Lv3' },
  { level: 4, threshold: 2000, name: 'Lv4' },
  { level: 5, threshold: 10000, name: 'Lv5' },
] as const;

/** 按累积充值金额计算当前等级（向下取整）。 */
export function computeTier(totalAmount: number): number {
  let current = TIER_THRESHOLDS[0]!.level;
  for (const t of TIER_THRESHOLDS) {
    if (totalAmount >= t.threshold) current = t.level;
    else break;
  }
  return current;
}

export interface TierProgress {
  /** 当前等级配置 */
  current: TierConfig;
  /** 下一等级配置；已是最高等级时为 null */
  next: TierConfig | null;
  /** 距离下一等级还差的金额（元）；已是最高等级时为 0 */
  remainingToNext: number;
  /** 在当前→下一等级区间内的完成百分比 0..100；已是最高等级时为 100 */
  percent: number;
}

export function tierProgress(totalAmount: number): TierProgress {
  const level = computeTier(totalAmount);
  const current = TIER_THRESHOLDS.find((t) => t.level === level)!;
  const next = TIER_THRESHOLDS.find((t) => t.level === level + 1) ?? null;
  if (next === null) {
    return { current, next: null, remainingToNext: 0, percent: 100 };
  }
  const span = next.threshold - current.threshold;
  const filled = Math.max(0, totalAmount - current.threshold);
  const percent = span <= 0 ? 100 : Math.min(100, Math.round((filled / span) * 100));
  const remainingToNext = Math.max(0, next.threshold - totalAmount);
  return { current, next, remainingToNext, percent };
}
