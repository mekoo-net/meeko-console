import type { RedemptionStatus } from './redemption.types';

export const RedemptionStatusLabel: Readonly<Record<RedemptionStatus, string>> = {
  1: '未使用',
  2: '已使用',
  3: '已禁用',
  4: '已过期',
};

export const RedemptionStatusTone: Readonly<
  Record<RedemptionStatus, 'success' | 'warning' | 'danger' | 'info'>
> = {
  1: 'success',
  2: 'info',
  3: 'warning',
  4: 'danger',
};
