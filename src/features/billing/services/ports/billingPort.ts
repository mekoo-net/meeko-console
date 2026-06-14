import type { AppResult } from '@/shared/api/httpTypes';
import type { Uid } from '@/shared/lib/id';

import type {
  BillingEntry,
  CreateInternalRechargeInput,
  CreateRechargeInput,
  RechargeIntent,
  RechargeProvider,
  RechargeRecord,
  RechargeStatus,
} from '../../model/billing.types';

export interface ListRechargesPage {
  items: RechargeRecord[];
  total: number;
}

export interface ListRechargesFilter {
  accountUid?: string;
  provider: RechargeProvider | 'all';
  status: RechargeStatus | 'all';
  fromUtc?: number;
  toUtc?: number;
}

export interface ListBillsPage {
  items: BillingEntry[];
  total: number;
}

export interface ListBillsFilter {
  accountUid?: string;
  productCode: string | 'all';
  subType: import('../../model/billing.types').BillSubType | 'all';
  status: import('../../model/billing.types').BillStatus | 'all';
  fromUtc?: number;
  toUtc?: number;
}

/**
 * 对齐 BFF 计费管理端（充值 / 账单流水）。
 */
export interface BillingPort {
  createRecharge(accountUid: Uid, input: CreateRechargeInput): Promise<AppResult<RechargeIntent>>;

  listRecharges(input: {
    page: number;
    pageSize: number;
    filter: ListRechargesFilter;
  }): Promise<AppResult<ListRechargesPage>>;

  createInternalRecharge(input: CreateInternalRechargeInput): Promise<AppResult<RechargeRecord>>;

  listBills(input: {
    page: number;
    pageSize: number;
    filter: ListBillsFilter;
  }): Promise<AppResult<ListBillsPage>>;

  /** 按账单流水号拉取单条详情（含扣款明细 / 业务信息），用于详情抽屉懒加载。 */
  getBill(serial: string): Promise<AppResult<BillingEntry>>;
}
