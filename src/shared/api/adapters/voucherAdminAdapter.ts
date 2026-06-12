import type {
  CreateVoucherTemplateInput,
  IssueVouchersInput,
  IssueVouchersResult,
  UpdateVoucherTemplateInput,
  UserVoucher,
  VoucherRedemption,
  VoucherTemplate,
} from '@/features/vouchers/model/voucher.types';
import type { VoucherPort } from '@/features/vouchers/services/ports/voucherPort';
import { fail, ok, type AppResult } from '@/shared/api/httpTypes';
import { request } from '@/shared/api/httpClient';
import { asEpochMillis, asEpochMillisNullable } from '@/shared/lib/epoch';

const BASE = '/api/admin/billing/vouchers';

type Raw = Record<string, unknown>;

function num(value: unknown, fallback = 0): number {
  const n = typeof value === 'string' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) ? n : fallback;
}

function numOrNull(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = typeof value === 'string' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

function mapTemplate(raw: Raw): VoucherTemplate {
  return {
    id: String(raw.id ?? ''),
    name: String(raw.name ?? ''),
    deductKind: num(raw.deductKind),
    faceValue: num(raw.faceValue),
    thresholdAmount: num(raw.thresholdAmount),
    discountRate: numOrNull(raw.discountRate),
    scopeKind: num(raw.scopeKind),
    scopeProductCodes: Array.isArray(raw.scopeProductCodes)
      ? (raw.scopeProductCodes as unknown[]).map((c) => String(c))
      : [],
    validityKind: num(raw.validityKind),
    validFromUtc: asEpochMillisNullable(raw.validFromUtc),
    validToUtc: asEpochMillisNullable(raw.validToUtc),
    validDays: numOrNull(raw.validDays),
    stackable: Boolean(raw.stackable),
    totalQuota: numOrNull(raw.totalQuota),
    issuedCount: num(raw.issuedCount),
    perUserLimit: numOrNull(raw.perUserLimit),
    status: num(raw.status),
    createdAtUtc: asEpochMillis(raw.createdAtUtc) ?? Date.now(),
    updatedAtUtc: asEpochMillis(raw.updatedAtUtc) ?? Date.now(),
  };
}

function mapUserVoucher(raw: Raw): UserVoucher {
  return {
    id: String(raw.id ?? ''),
    templateId: String(raw.templateId ?? ''),
    accountUid: String(raw.accountUid ?? ''),
    serialNo: raw.serialNo != null ? String(raw.serialNo) : null,
    deductKind: num(raw.deductKind),
    faceValue: num(raw.faceValue),
    thresholdAmount: num(raw.thresholdAmount),
    remainingValue: num(raw.remainingValue),
    validFromUtc: asEpochMillis(raw.validFromUtc) ?? 0,
    validToUtc: asEpochMillis(raw.validToUtc) ?? 0,
    status: num(raw.status),
    issuedAtUtc: asEpochMillis(raw.issuedAtUtc) ?? 0,
  };
}

function mapRedemption(raw: Raw): VoucherRedemption {
  return {
    id: String(raw.id ?? ''),
    userVoucherId: String(raw.userVoucherId ?? ''),
    accountUid: String(raw.accountUid ?? ''),
    productCode: String(raw.productCode ?? ''),
    amountDeducted: num(raw.amountDeducted),
    occurredAtUtc: asEpochMillis(raw.occurredAtUtc) ?? 0,
  };
}

function parseTemplate(value: unknown): AppResult<VoucherTemplate> {
  if (!value || typeof value !== 'object') return fail({ code: 'validation', message: '券批次数据格式错误' });
  return ok(mapTemplate(value as Raw));
}

export class VoucherHttpAdapter implements VoucherPort {
  async listTemplates(includeArchived = false): Promise<AppResult<VoucherTemplate[]>> {
    const res = await request<unknown>(`${BASE}/templates`, {
      query: { includeArchived: includeArchived ? 'true' : undefined },
    });
    if (!res.success) return res;
    const rows = Array.isArray(res.data) ? res.data : [];
    return ok(rows.map((r) => mapTemplate((r ?? {}) as Raw)));
  }

  async getTemplate(id: string): Promise<AppResult<VoucherTemplate>> {
    const res = await request<unknown>(`${BASE}/templates/${encodeURIComponent(id)}`);
    if (!res.success) return res;
    return parseTemplate(res.data);
  }

  async createTemplate(input: CreateVoucherTemplateInput): Promise<AppResult<VoucherTemplate>> {
    const res = await request<unknown>(`${BASE}/templates`, { method: 'POST', body: input });
    if (!res.success) return res;
    return parseTemplate(res.data);
  }

  async updateTemplate(id: string, input: UpdateVoucherTemplateInput): Promise<AppResult<VoucherTemplate>> {
    const res = await request<unknown>(`${BASE}/templates/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: input,
    });
    if (!res.success) return res;
    return parseTemplate(res.data);
  }

  async setTemplateStatus(id: string, status: number): Promise<AppResult<VoucherTemplate>> {
    const res = await request<unknown>(`${BASE}/templates/${encodeURIComponent(id)}/status`, {
      method: 'POST',
      body: { status },
    });
    if (!res.success) return res;
    return parseTemplate(res.data);
  }

  async issue(id: string, input: IssueVouchersInput): Promise<AppResult<IssueVouchersResult>> {
    const res = await request<Raw>(`${BASE}/templates/${encodeURIComponent(id)}/issue`, {
      method: 'POST',
      body: input,
    });
    if (!res.success) return res;
    return ok({
      issuedCount: num(res.data.issuedCount),
      requestedCount: num(res.data.requestedCount),
    });
  }

  async revoke(userVoucherId: string): Promise<AppResult<boolean>> {
    const res = await request<boolean>(`${BASE}/user-vouchers/${encodeURIComponent(userVoucherId)}/revoke`, {
      method: 'POST',
    });
    if (!res.success) return res;
    return ok(Boolean(res.data));
  }

  async listUserVouchers(accountUid: string, take = 100): Promise<AppResult<UserVoucher[]>> {
    const res = await request<unknown>(`${BASE}/user-vouchers`, { query: { accountUid, take } });
    if (!res.success) return res;
    const rows = Array.isArray(res.data) ? res.data : [];
    return ok(rows.map((r) => mapUserVoucher((r ?? {}) as Raw)));
  }

  async listRedemptions(accountUid: string, take = 100): Promise<AppResult<VoucherRedemption[]>> {
    const res = await request<unknown>(`${BASE}/redemptions`, { query: { accountUid, take } });
    if (!res.success) return res;
    const rows = Array.isArray(res.data) ? res.data : [];
    return ok(rows.map((r) => mapRedemption((r ?? {}) as Raw)));
  }
}
