import type { AppResult } from '@/shared/api/httpTypes';
import type { Uid } from '@/shared/lib/id';

import type {
  CreateRechargeInput,
  InvoiceDto,
  ListInvoicesFilter,
  ListOrdersFilter,
  OrderDto,
  PlaceOrderInput,
  PlaceOrderResult,
  RechargeIntent,
  RechargeRecord,
  RechargeStatus,
  SubscriptionDto,
  WalletSnapshot,
} from '../../model/billing.types';

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
  status: RechargeStatus | 'all';
}

/**
 * 对齐 BFF `/api/billing`（Keystone 当前登录上下文下的账户）。
 * 管理台 Mock 显式传入 `accountUid`，便于按账户切换核对数据。
 *
 * 说明：`listOrders` 在现有 BFF 中尚无列表端点，仅为 Mock / 未来扩展预留；
 * HttpAdapter 可实现为上游分页或 501。
 */
export interface BillingPort {
  getWallet(accountUid: Uid): Promise<AppResult<WalletSnapshot | null>>;
  createRecharge(accountUid: Uid, input: CreateRechargeInput): Promise<AppResult<RechargeIntent>>;
  placeOrder(accountUid: Uid, input: PlaceOrderInput): Promise<AppResult<PlaceOrderResult>>;
  getOrder(accountUid: Uid, orderUid: Uid): Promise<AppResult<OrderDto>>;
  listOrders(
    accountUid: Uid,
    input: { page: number; pageSize: number; filter: ListOrdersFilter },
  ): Promise<AppResult<ListOrdersPage>>;
  listSubscriptions(accountUid: Uid): Promise<AppResult<SubscriptionDto[]>>;
  setSubscriptionCancelAtPeriodEnd(subscriptionUid: Uid, flag: boolean): Promise<AppResult<void>>;
  listInvoices(
    accountUid: Uid,
    input: { page: number; pageSize: number; filter: ListInvoicesFilter },
  ): Promise<AppResult<ListInvoicesPage>>;

  /** 平台级全量充值记录，accountUid 为空时查所有账户 */
  listRecharges(input: {
    page: number;
    pageSize: number;
    filter: ListRechargesFilter;
  }): Promise<AppResult<ListRechargesPage>>;
}
