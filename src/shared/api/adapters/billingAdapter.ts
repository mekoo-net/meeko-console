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
  BillDeduction,
  BillingEntry,
  BillFailureCode,
  BillRefType,
  BillReversedCode,
  BillStatus,
  BillSubType,
  VoucherDeductKind,
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
  const ownerParty = readParty((raw.owner ?? raw.Owner) as Record<string, unknown> | null | undefined);
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
    owner: ownerParty,
    source: {
      provider: String(source?.provider ?? source?.Provider ?? 'manual') as RechargeProvider,
      scene: Number(source?.scene ?? source?.Scene ?? 0),
      refNo: String(source?.refNo ?? source?.RefNo ?? ''),
    },
    amount: { value: amount, currency },
    status: String(raw.status ?? raw.Status ?? 'pending') as RechargeStatus,
    operatorIamId: str(operator?.iamUserUid, operator?.IamUserUid),
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

/** 读取可空字段为 string | null（兼容驼峰/帕斯卡两种 wire 命名）。 */
function str(...vals: unknown[]): string | null {
  for (const v of vals) {
    if (v != null) return String(v);
  }
  return null;
}

function mapBillDto(raw: Record<string, unknown>): BillingEntry {
  const owner = readParty((raw.owner ?? raw.Owner) as Record<string, unknown> | null | undefined);
  const operator = readParty(
    (raw.operator ?? raw.Operator) as Record<string, unknown> | null | undefined,
  );
  const business = (raw.business ?? raw.Business) as Record<string, unknown> | null | undefined;
  const amount = (raw.amount ?? raw.Amount) as Record<string, unknown> | null | undefined;
  // ref/subType/requestId 现已收进 business；保留对旧 wire（顶层 Ref/SubType）的兜底读取。
  const ref = (raw.ref ?? raw.Ref) as Record<string, unknown> | null | undefined;
  const failure = (raw.failure ?? raw.Failure) as Record<string, unknown> | null | undefined;
  const reversal = (raw.reversal ?? raw.Reversal) as Record<string, unknown> | null | undefined;

  return {
    id: String(raw.id ?? raw.Id ?? ''),
    owner: { ...owner, accountUid: owner.accountUid },
    operator: { ...operator, accountUid: operator.accountUid || owner.accountUid },
    business: {
      productCode: str(business?.productCode, business?.ProductCode),
      subType: str(business?.subType, business?.SubType, raw.subType, raw.SubType) as BillSubType | null,
      refType: str(business?.refType, business?.RefType, ref?.type, ref?.Type) as BillRefType | null,
      refId: str(business?.refId, business?.RefId, ref?.id, ref?.Id),
      requestId: str(business?.requestId, business?.RequestId, raw.requestId, raw.RequestId),
      originLogId: str(business?.originLogId, business?.OriginLogId),
    },
    status: String(raw.status ?? raw.Status ?? 'pending') as BillStatus,
    failureCode: str(failure?.code, failure?.Code) as BillFailureCode | null,
    amount: {
      original: Number(amount?.original ?? amount?.Original ?? 0),
      actual: Number(amount?.actual ?? amount?.Actual ?? 0),
      currency: String(amount?.currency ?? amount?.Currency ?? 'CNY'),
      balanceAfter:
        amount?.balanceAfter != null || amount?.BalanceAfter != null
          ? Number(amount.balanceAfter ?? amount.BalanceAfter)
          : null,
    },
    reversal: {
      atUtc: asEpochMillisNullable(reversal?.atUtc ?? reversal?.AtUtc),
      byIamId: str(reversal?.byIamUserUid, reversal?.ByIamUserUid),
      code: str(reversal?.code, reversal?.Code) as BillReversedCode | null,
    },
    occurredAtUtc: asEpochMillis(raw.occurredAtUtc ?? raw.OccurredAtUtc) ?? 0,
    deduction: mapDeduction((raw.deduction ?? raw.Deduction) as Record<string, unknown> | null | undefined),
  };
}

function mapDeduction(raw: Record<string, unknown> | null | undefined): BillDeduction | null {
  if (raw == null || typeof raw !== 'object') return null;

  const itemsRaw = (raw.voucherItems ?? raw.VoucherItems) as unknown[] | null | undefined;
  const voucherItems = (itemsRaw ?? []).map((it) => {
    const item = it as Record<string, unknown>;
    return {
      userVoucherId: String(item.userVoucherId ?? item.UserVoucherId ?? ''),
      serialNo:
        item.serialNo != null || item.SerialNo != null
          ? String(item.serialNo ?? item.SerialNo)
          : null,
      amountDeducted: Number(item.amountDeducted ?? item.AmountDeducted ?? 0),
      name:
        item.name != null || item.Name != null
          ? String(item.name ?? item.Name)
          : null,
      deductKind:
        item.deductKind != null || item.DeductKind != null
          ? (String(item.deductKind ?? item.DeductKind) as VoucherDeductKind)
          : null,
      faceValue:
        item.faceValue != null || item.FaceValue != null
          ? Number(item.faceValue ?? item.FaceValue)
          : null,
      remainingValue:
        item.remainingValue != null || item.RemainingValue != null
          ? Number(item.remainingValue ?? item.RemainingValue)
          : null,
      validToUtc: asEpochMillisNullable(item.validToUtc ?? item.ValidToUtc),
      thresholdAmount:
        item.thresholdAmount != null || item.ThresholdAmount != null
          ? Number(item.thresholdAmount ?? item.ThresholdAmount)
          : null,
      discountRate:
        item.discountRate != null || item.DiscountRate != null
          ? Number(item.discountRate ?? item.DiscountRate)
          : null,
    };
  });

  return {
    total: Number(raw.total ?? raw.Total ?? 0),
    voucherDeducted: Number(raw.voucherDeducted ?? raw.VoucherDeducted ?? 0),
    balanceDeducted: Number(raw.balanceDeducted ?? raw.BalanceDeducted ?? 0),
    voucherItems,
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
        productCode: input.productCode,
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

  async getBill(serial: string): Promise<AppResult<BillingEntry>> {
    const res = await request<Record<string, unknown>>(
      `/api/admin/billing/bills/${encodeURIComponent(serial)}`,
    );
    if (!res.success) return res;
    return { success: true, data: mapBillDto(res.data) };
  }
}
