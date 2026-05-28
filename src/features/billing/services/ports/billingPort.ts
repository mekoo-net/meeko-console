import type { AppResult } from '@/shared/api/httpTypes';
import type { Uid } from '@/shared/lib/id';

import type {
  BillingEntry,
  CreateRechargeInput,
  InvoiceDto,
  ListBillsFilter,
  ListInvoicesFilter,
  ListOrdersFilter,
  OrderDto,
  PlaceOrderInput,
  PlaceOrderResult,
  RechargeIntent,
  RechargeProvider,
  RechargeRecord,
  RechargeStatus,
  SubscriptionDto,
} from '../../model/billing.types';
import type { BusinessInstance, ListBusinessesFilter } from '../../model/business.types';

export interface ListOrdersPage {
  items: OrderDto[];
  total: number;
}

export interface ListInvoicesPage {
  items: InvoiceDto[];
  total: number;
}

export interface ListRechargesPage {
  items: RechargeRecord[];
  total: number;
}

export interface ListRechargesFilter {
  accountUid?: string;
  provider: RechargeProvider | 'all';
  status: RechargeStatus | 'all';
  /** 创建时间起点（ISO8601，inclusive） */
  fromUtc?: string;
  /** 创建时间终点（ISO8601，inclusive） */
  toUtc?: string;
}

export interface ListBillsPage {
  items: BillingEntry[];
  total: number;
}

export type { ListBillsFilter };

/**
 * 对齐 BFF `/api/billing` 管理端聚合（充值 / 账单 / 业务等）。
 * 钱包余额不在此 Port：列表读 `account.walletSummary`，详情读 `account.wallet`（见 AccountAdminPort）。
 *
 * 说明：`listOrders` 在现有 BFF 中尚无列表端点，仅为 Mock / 未来扩展预留；
 * HttpAdapter 可实现为上游分页或 501。
 */
export interface BillingPort {
  createRecharge(accountUid: Uid, input: CreateRechargeInput): Promise<AppResult<RechargeIntent>>;
  placeOrder(accountUid: Uid, input: PlaceOrderInput): Promise<AppResult<PlaceOrderResult>>;
  getOrder(accountUid: Uid, orderId: Uid): Promise<AppResult<OrderDto>>;
  listOrders(
    accountUid: Uid,
    input: { page: number; pageSize: number; filter: ListOrdersFilter },
  ): Promise<AppResult<ListOrdersPage>>;
  listSubscriptions(accountUid: Uid): Promise<AppResult<SubscriptionDto[]>>;
  setSubscriptionCancelAtPeriodEnd(subscriptionId: Uid, flag: boolean): Promise<AppResult<void>>;
  listInvoices(
    accountUid: Uid,
    input: { page: number; pageSize: number; filter: ListInvoicesFilter },
  ): Promise<AppResult<ListInvoicesPage>>;

  /**
   * 平台级全量充值记录（用户付费 / 客服补偿 / 营销奖励 / 手工充值），
   * accountUid 为空时查所有账户。
   */
  listRecharges(input: {
    page: number;
    pageSize: number;
    filter: ListRechargesFilter;
  }): Promise<AppResult<ListRechargesPage>>;

  /**
   * 平台级全量账单（钱包扣款流水），accountUid 为空时查所有账户。
   *
   * 错扣回滚不另起一条记录，而是直接驳回原条目（`status='reversed'` 且
   * `actualAmount=0`），便于审计一一对应。
   */
  listBills(input: {
    page: number;
    pageSize: number;
    filter: ListBillsFilter;
  }): Promise<AppResult<ListBillsPage>>;

  /**
   * 列出账户已开通的业务（三态：opened / paused / stopped）。
   * 业务实例与订单 / 订阅是兄弟概念，不分页（单账户通常 < 50 条）。
   */
  listBusinesses(
    accountUid: Uid,
    filter: ListBusinessesFilter,
  ): Promise<AppResult<BusinessInstance[]>>;
}
