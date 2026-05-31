import { toRaw } from 'vue';

import type { RedemptionCode } from './redemption.types';
import { RedemptionStatusLabel, RedemptionStatusTone } from './redemptionEnums';

/** 脱离响应式代理的 Plain 快照（供详情 Drawer 使用）。 */
export function snapshotRedemptionCode(row: RedemptionCode): RedemptionCode {
  return JSON.parse(JSON.stringify(toRaw(row))) as RedemptionCode;
}

type Tone = 'success' | 'warning' | 'danger' | 'info';

export function isRedemptionExpired(row: RedemptionCode, nowMs = Date.now()): boolean {
  return row.expiredTime != null && row.expiredTime > 0 && row.expiredTime <= nowMs;
}

export function isRedemptionExhausted(row: RedemptionCode): boolean {
  return row.redeemedCount >= row.maxRedemptions;
}

/** 列表展示用状态（一码多次时有「进行中 / 已领完」）。 */
export function redemptionDisplayStatus(row: RedemptionCode): { label: string; tone: Tone } {
  if (row.status === 3) {
    return { label: RedemptionStatusLabel[3], tone: RedemptionStatusTone[3] };
  }
  if (row.status === 4 || isRedemptionExpired(row)) {
    return { label: RedemptionStatusLabel[4], tone: RedemptionStatusTone[4] };
  }
  if (row.maxRedemptions > 1) {
    if (isRedemptionExhausted(row)) {
      return { label: '已领完', tone: 'info' };
    }
    if (row.redeemedCount > 0) {
      return { label: '进行中', tone: 'warning' };
    }
    return { label: '可领取', tone: 'success' };
  }
  return {
    label: RedemptionStatusLabel[row.status],
    tone: RedemptionStatusTone[row.status],
  };
}

export function redemptionProgressText(row: RedemptionCode): string {
  if (row.maxRedemptions <= 1) {
    return row.redeemedCount > 0 ? '已领取' : '—';
  }
  return `${row.redeemedCount} / ${row.maxRedemptions}`;
}

/** 领取进度 0–100（活动码用）。 */
export function redemptionProgressPercent(row: RedemptionCode): number {
  if (row.maxRedemptions <= 0) return 0;
  return Math.min(100, Math.round((row.redeemedCount / row.maxRedemptions) * 100));
}

/** 列表中脱敏展示 Key。 */
export function maskRedemptionKey(key: string): string {
  if (key.length <= 14) return key;
  return `${key.slice(0, 8)}···${key.slice(-4)}`;
}

export interface RedemptionListStats {
  total: number;
  claimable: number;
  inProgress: number;
  exhausted: number;
  expired: number;
}

export function computeRedemptionStats(rows: RedemptionCode[]): RedemptionListStats {
  const stats: RedemptionListStats = {
    total: rows.length,
    claimable: 0,
    inProgress: 0,
    exhausted: 0,
    expired: 0,
  };
  for (const row of rows) {
    const { label } = redemptionDisplayStatus(row);
    if (label === '可领取') stats.claimable++;
    else if (label === '进行中') stats.inProgress++;
    else if (label === '已领完' || (row.maxRedemptions <= 1 && row.redeemedCount > 0)) stats.exhausted++;
    else if (label === RedemptionStatusLabel[4] || row.status === 3 || row.status === 4) stats.expired++;
    else if (row.maxRedemptions <= 1 && row.status === 2) stats.exhausted++;
  }
  return stats;
}
