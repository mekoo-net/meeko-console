import type { AppResult } from '@/shared/api/httpTypes';
import { fail } from '@/shared/api/httpTypes';
import { request } from '@/shared/api/httpClient';
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
  SubscriptionDto,
  WalletSnapshot,
} from '@/features/billing/model/billing.types';
import type {
  BusinessInstance,
  ListBusinessesFilter,
} from '@/features/billing/model/business.types';
import type {
  BillingPort,
  ListBillsFilter,
  ListBillsPage,
  ListInvoicesPage,
  ListOrdersPage,
  ListRechargesFilter,
  ListRechargesPage,
} from '@/features/billing/services/ports/billingPort';

export class BillingHttpAdapter implements BillingPort {
  async getWallet(_accountUid: Uid): Promise<AppResult<WalletSnapshot | null>> {
    return request<WalletSnapshot | null>('/api/billing/wallet');
  }

  async createRecharge(_accountUid: Uid, input: CreateRechargeInput): Promise<AppResult<RechargeIntent>> {
    return request<RechargeIntent>('/api/billing/wallet/recharge', {
      method: 'POST',
      body: input,
    });
  }

  async placeOrder(_accountUid: Uid, input: PlaceOrderInput): Promise<AppResult<PlaceOrderResult>> {
    return request<PlaceOrderResult>('/api/billing/orders', {
      method: 'POST',
      body: input,
    });
  }

  async getOrder(_accountUid: Uid, orderId: Uid): Promise<AppResult<OrderDto>> {
    return request<OrderDto>(`/api/billing/orders/${orderId}`);
  }

  async listOrders(
    _accountUid: Uid,
    _input: { page: number; pageSize: number; filter: ListOrdersFilter },
  ): Promise<AppResult<ListOrdersPage>> {
    return fail({ code: 'unknown', message: 'listOrders: BFF 暂无此端点' });
  }

  async listSubscriptions(_accountUid: Uid): Promise<AppResult<SubscriptionDto[]>> {
    return request<SubscriptionDto[]>('/api/billing/subscriptions');
  }

  async setSubscriptionCancelAtPeriodEnd(subscriptionId: Uid, flag: boolean): Promise<AppResult<void>> {
    return request<void>(`/api/billing/subscriptions/${subscriptionId}/cancel-at-period-end`, {
      method: 'POST',
      query: { flag },
    });
  }

  async listInvoices(
    _accountUid: Uid,
    input: { page: number; pageSize: number; filter: ListInvoicesFilter },
  ): Promise<AppResult<ListInvoicesPage>> {
    const { filter } = input;
    const rows = await request<InvoiceDto[]>('/api/billing/invoices', {
      query: {
        kind: filter.kind === 'all' ? undefined : filter.kind,
        fromUtc: filter.fromUtc,
        toUtc: filter.toUtc,
      },
    });
    if (!rows.success) return rows;
    return { success: true, data: { items: rows.data, total: rows.data.length } };
  }

  async listRecharges(input: {
    page: number;
    pageSize: number;
    filter: ListRechargesFilter;
  }): Promise<AppResult<ListRechargesPage>> {
    const { page, pageSize, filter } = input;
    return request<ListRechargesPage>('/api/billing/recharges', {
      query: {
        page,
        pageSize,
        accountUid: filter.accountUid,
        provider: filter.provider === 'all' ? undefined : filter.provider,
        status: filter.status === 'all' ? undefined : filter.status,
        fromUtc: filter.fromUtc,
        toUtc: filter.toUtc,
      },
    });
  }

  async listBills(input: {
    page: number;
    pageSize: number;
    filter: ListBillsFilter;
  }): Promise<AppResult<ListBillsPage>> {
    const { page, pageSize, filter } = input;
    return request<ListBillsPage>('/api/billing/bills', {
      query: {
        page,
        pageSize,
        accountUid: filter.accountUid,
        business: filter.business === 'all' ? undefined : filter.business,
        subType: filter.subType === 'all' ? undefined : filter.subType,
        status: filter.status === 'all' ? undefined : filter.status,
        fromUtc: filter.fromUtc,
        toUtc: filter.toUtc,
      },
    });
  }

  async listBusinesses(accountUid: Uid, _filter: ListBusinessesFilter): Promise<AppResult<BusinessInstance[]>> {
    return request<BusinessInstance[]>('/api/billing/businesses', {
      query: { accountUid },
    });
  }
}
