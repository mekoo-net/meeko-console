import type { AppResult } from '@/shared/api/httpTypes';
import { fail } from '@/shared/api/httpTypes';
import { request } from '@/shared/api/httpClient';
import type { Uid } from '@/shared/lib/id';

import type {
  CreateInternalRechargeInput,
  CreateRechargeInput,
  InvoiceDto,
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
} from '@/features/billing/model/billing.types';
import type {
  BusinessInstance,
  ListBusinessesFilter,
} from '@/features/billing/model/business.types';
import type {
  BillingEntry,
  BillFailureCode,
  BillRefType,
  BillReversedCode,
  BillStatus,
  BillSubType,
  BusinessCode,
} from '@/features/billing/model/billing.types';
import type {
  BillingPort,
  ListBillsFilter,
  ListBillsPage,
  ListInvoicesPage,
  ListOrdersPage,
  ListRechargesFilter,
  ListRechargesPage,
} from '@/features/billing/services/ports/billingPort';

interface RechargeListWire {
  items: RechargeDtoWire[];
  total: number;
}

interface RechargeDtoWire {
  id: string;
  owner: { accountUid: string | number };
  source: { provider: string; scene: number; refNo: string };
  amount: { value: number; currency: string };
  status: string;
  operator?: { iamUserUid?: string | number | null } | null;
  createdAtUtc: string;
  paidAtUtc?: string | null;
}

function mapRechargeDto(raw: Record<string, unknown>): RechargeRecord {
  const owner = (raw.owner ?? raw.Owner) as Record<string, unknown> | undefined;
  const source = (raw.source ?? raw.Source) as Record<string, unknown> | undefined;
  const amountBlock = raw.amount ?? raw.Amount;
  const operator = (raw.operator ?? raw.Operator) as Record<string, unknown> | null | undefined;

  let amount = 0;
  let currency = 'CNY';
  if (amountBlock != null && typeof amountBlock === 'object') {
    const block = amountBlock as Record<string, unknown>;
    amount = Number(block.value ?? block.Value ?? 0);
    currency = String(block.currency ?? block.Currency ?? 'CNY');
  } else if (typeof amountBlock === 'number') {
    amount = amountBlock;
    currency = String(raw.currency ?? raw.Currency ?? 'CNY');
  }

  return {
    id: String(raw.id ?? raw.Id ?? ''),
    ownerAccountUid: String(owner?.accountUid ?? owner?.AccountUid ?? ''),
    provider: String(source?.provider ?? source?.Provider ?? 'manual') as RechargeProvider,
    scene: Number(source?.scene ?? source?.Scene ?? 0),
    refNo: String(source?.refNo ?? source?.RefNo ?? ''),
    amount,
    currency,
    status: String(raw.status ?? raw.Status ?? 'pending') as RechargeStatus,
    operatorIamId:
      operator?.iamUserUid != null || operator?.IamUserUid != null
        ? String(operator.iamUserUid ?? operator.IamUserUid)
        : null,
    createdAtUtc: String(raw.createdAtUtc ?? raw.CreatedAtUtc ?? ''),
    paidAtUtc:
      raw.paidAtUtc != null || raw.PaidAtUtc != null
        ? String(raw.paidAtUtc ?? raw.PaidAtUtc)
        : null,
  };
}

function mapBillDto(raw: Record<string, unknown>): BillingEntry {
  const owner    = raw.owner    as Record<string, unknown> | null | undefined;
  const operator = raw.operator as Record<string, unknown> | null | undefined;
  const business = raw.business as Record<string, unknown> | null | undefined;
  const amount   = raw.amount   as Record<string, unknown> | null | undefined;
  const ref      = raw.ref      as Record<string, unknown> | null | undefined;
  const failure  = raw.failure  as Record<string, unknown> | null | undefined;
  const reversal = raw.reversal as Record<string, unknown> | null | undefined;

  return {
    id:                  String(raw.id ?? ''),
    ownerAccountUid:     String(owner?.accountUid ?? ''),
    operatorAccountUid:  String(operator?.accountUid ?? ''),
    business:            (business?.domain ?? null) as BusinessCode | null,
    productCode:         business?.productCode != null ? String(business.productCode) : null,
    subType:             (raw.subType ?? null) as BillSubType | null,
    status:              String(raw.status ?? 'pending') as BillStatus,
    failureCode:         failure?.code != null ? (String(failure.code) as BillFailureCode) : null,
    originalAmount:      Number(amount?.original ?? 0),
    actualAmount:        Number(amount?.actual ?? 0),
    currency:            String(amount?.currency ?? 'CNY'),
    balanceAfter:        amount?.balanceAfter != null ? Number(amount.balanceAfter) : null,
    refType:             ref?.type != null ? (String(ref.type) as BillRefType) : null,
    refId:               ref?.id != null ? String(ref.id) : null,
    reversedAtUtc:       reversal?.atUtc != null ? String(reversal.atUtc) : null,
    reversedByIamId:     reversal?.byIamUserUid != null ? String(reversal.byIamUserUid) : null,
    reversedCode:        reversal?.code != null ? (String(reversal.code) as BillReversedCode) : null,
    occurredAtUtc:       String(raw.occurredAtUtc ?? ''),
  };
}

export class BillingHttpAdapter implements BillingPort {
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
    const res = await request<RechargeListWire>('/api/billing/recharges', {
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
    if (!res.success) return res;
    return {
      success: true,
      data: {
        items: res.data.items.map((row) => mapRechargeDto(row as unknown as Record<string, unknown>)),
        total: res.data.total,
      },
    };
  }

  async createInternalRecharge(
    input: CreateInternalRechargeInput,
  ): Promise<AppResult<RechargeRecord>> {
    const res = await request<RechargeDtoWire>('/api/billing/recharges/internal', {
      method: 'POST',
      body: {
        ownerAccountUid: Number(input.ownerAccountUid),
        source: input.source,
        amount: input.amount,
        note: input.note,
        idempotencyKey: input.idempotencyKey,
      },
    });
    if (!res.success) return res;
    return { success: true, data: mapRechargeDto(res.data as unknown as Record<string, unknown>) };
  }

  async listBills(input: {
    page: number;
    pageSize: number;
    filter: ListBillsFilter;
  }): Promise<AppResult<ListBillsPage>> {
    const { page, pageSize, filter } = input;
    const res = await request<{ items: Record<string, unknown>[]; total: number }>(
      '/api/admin/billing/bills',
      {
        query: {
          page,
          pageSize,
          accountUid: filter.accountUid,
          business:  filter.business === 'all'  ? undefined : filter.business,
          subType:   filter.subType === 'all'   ? undefined : filter.subType,
          status:    filter.status === 'all'    ? undefined : filter.status,
          fromUtc:   filter.fromUtc,
          toUtc:     filter.toUtc,
        },
      },
    );
    if (!res.success) return res;
    return {
      success: true,
      data: {
        items: res.data.items.map(mapBillDto),
        total: res.data.total,
      },
    };
  }

  async listBusinesses(accountUid: Uid, _filter: ListBusinessesFilter): Promise<AppResult<BusinessInstance[]>> {
    return request<BusinessInstance[]>('/api/billing/businesses', {
      query: { accountUid },
    });
  }
}
