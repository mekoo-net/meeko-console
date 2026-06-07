import type { AppResult } from '@/shared/api/httpTypes';
import { request } from '@/shared/api/httpClient';
import type { Uid } from '@/shared/lib/id';
import { asEpochMillis, asEpochMillisNullable } from '@/shared/lib/epoch';

import type {
  CreateInternalRechargeInput,
  CreateRechargeInput,
  RechargeIntent,
  RechargeProvider,
  RechargeRecord,
  RechargeStatus,
} from '@/features/billing/model/billing.types';
import type {
  BillingEntry,
  BillFailureCode,
  BillRefType,
  BillReversedCode,
  BillStatus,
  BillSubType,
} from '@/features/billing/model/billing.types';
import type {
  BillingPort,
  ListBillsFilter,
  ListBillsPage,
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
  createdAtUtc: number | string;
  paidAtUtc?: number | string | null;
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
    createdAtUtc: asEpochMillis(raw.createdAtUtc ?? raw.CreatedAtUtc) ?? 0,
    paidAtUtc: asEpochMillisNullable(raw.paidAtUtc ?? raw.PaidAtUtc),
  };
}

function readParty(raw: Record<string, unknown> | null | undefined) {
  if (!raw) {
    return {
      accountUid: '',
      displayName: null as string | null,
      email: null as string | null,
      phone: null as string | null,
    };
  }
  return {
    accountUid: String(raw.accountUid ?? raw.AccountUid ?? ''),
    displayName:
      raw.displayName != null || raw.DisplayName != null
        ? String(raw.displayName ?? raw.DisplayName)
        : null,
    email:
      raw.email != null || raw.Email != null ? String(raw.email ?? raw.Email) : null,
    phone:
      raw.phone != null || raw.Phone != null ? String(raw.phone ?? raw.Phone) : null,
  };
}

function mapBillDto(raw: Record<string, unknown>): BillingEntry {
  const owner = readParty((raw.owner ?? raw.Owner) as Record<string, unknown> | null | undefined);
  const operator = readParty(
    (raw.operator ?? raw.Operator) as Record<string, unknown> | null | undefined,
  );
  const business = (raw.business ?? raw.Business) as Record<string, unknown> | null | undefined;
  const amount = (raw.amount ?? raw.Amount) as Record<string, unknown> | null | undefined;
  const ref = (raw.ref ?? raw.Ref) as Record<string, unknown> | null | undefined;
  const failure = (raw.failure ?? raw.Failure) as Record<string, unknown> | null | undefined;
  const reversal = (raw.reversal ?? raw.Reversal) as Record<string, unknown> | null | undefined;

  return {
    id: String(raw.id ?? raw.Id ?? ''),
    ownerAccountUid: owner.accountUid,
    operatorAccountUid: operator.accountUid || owner.accountUid,
    ownerDisplayName: owner.displayName,
    ownerEmail: owner.email,
    ownerPhone: owner.phone,
    operatorDisplayName: operator.displayName,
    operatorEmail: operator.email,
    operatorPhone: operator.phone,
    productCode:
      business?.productCode != null || business?.ProductCode != null
        ? String(business.productCode ?? business.ProductCode)
        : null,
    subType:
      raw.subType != null || raw.SubType != null
        ? (String(raw.subType ?? raw.SubType) as BillSubType)
        : null,
    status: String(raw.status ?? raw.Status ?? 'pending') as BillStatus,
    failureCode:
      failure?.code != null || failure?.Code != null
        ? (String(failure.code ?? failure.Code) as BillFailureCode)
        : null,
    originalAmount: Number(amount?.original ?? amount?.Original ?? 0),
    actualAmount: Number(amount?.actual ?? amount?.Actual ?? 0),
    currency: String(amount?.currency ?? amount?.Currency ?? 'CNY'),
    balanceAfter:
      amount?.balanceAfter != null || amount?.BalanceAfter != null
        ? Number(amount.balanceAfter ?? amount.BalanceAfter)
        : null,
    refType:
      ref?.type != null || ref?.Type != null
        ? (String(ref.type ?? ref.Type) as BillRefType)
        : null,
    refId: ref?.id != null || ref?.Id != null ? String(ref.id ?? ref.Id) : null,
    reversedAtUtc: asEpochMillisNullable(reversal?.atUtc ?? reversal?.AtUtc),
    reversedByIamId:
      reversal?.byIamUserUid != null || reversal?.ByIamUserUid != null
        ? String(reversal.byIamUserUid ?? reversal.ByIamUserUid)
        : null,
    reversedCode:
      reversal?.code != null || reversal?.Code != null
        ? (String(reversal.code ?? reversal.Code) as BillReversedCode)
        : null,
    occurredAtUtc: asEpochMillis(raw.occurredAtUtc ?? raw.OccurredAtUtc) ?? 0,
  };
}

export class BillingHttpAdapter implements BillingPort {
  async createRecharge(
    _accountUid: Uid,
    input: CreateRechargeInput,
  ): Promise<AppResult<RechargeIntent>> {
    return request<RechargeIntent>('/api/billing/wallet/recharge', {
      method: 'POST',
      body: input,
    });
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
          productCode: filter.productCode === 'all' ? undefined : filter.productCode,
          subType: filter.subType === 'all' ? undefined : filter.subType,
          status: filter.status === 'all' ? undefined : filter.status,
          fromUtc: filter.fromUtc,
          toUtc: filter.toUtc,
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
}
