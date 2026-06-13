import {
  VoucherDeductKind,
  VoucherValidityKind,
  type ActivityClaimer,
  type ActivityVoucherItem,
  type CreateVoucherActivityInput,
  type CreateVoucherTemplateInput,
  type IssueVouchersInput,
  type IssueVouchersResult,
  type UpdateVoucherActivityInput,
  type UpdateVoucherTemplateInput,
  type UserVoucher,
  type VoucherActivity,
  type VoucherRedemption,
  type VoucherRule,
  type VoucherTemplate,
  type VoucherValidity,
} from '@/features/vouchers/model/voucher.types';
import type { VoucherPort } from '@/features/vouchers/services/ports/voucherPort';
import { fail, ok, type AppResult } from '@/shared/api/httpTypes';
import { request } from '@/shared/api/httpClient';
import { asEpochMillis, asEpochMillisNullable } from '@/shared/lib/epoch';

const TEMPLATES = '/api/admin/billing/voucher/templates';
const ACTIVITIES = '/api/admin/billing/voucher/activities';
const VOUCHERS = '/api/admin/billing/vouchers';

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

// 平铺 wire → 判别联合：把券类型专属字段收进 rule，杜绝下游的可空字段兜底。
function mapRule(raw: Raw): VoucherRule {
  const faceValue = num(raw.faceValue);
  const thresholdAmount = num(raw.thresholdAmount);
  switch (num(raw.deductKind)) {
    case VoucherDeductKind.Discount:
      return { kind: VoucherDeductKind.Discount, discountRate: num(raw.discountRate), capValue: faceValue, thresholdAmount };
    case VoucherDeductKind.FullReduction:
      return { kind: VoucherDeductKind.FullReduction, faceValue, thresholdAmount };
    default:
      return { kind: VoucherDeductKind.NoThreshold, faceValue };
  }
}

function mapValidity(raw: Raw): VoucherValidity {
  if (num(raw.validityKind) === VoucherValidityKind.Absolute) {
    return {
      kind: VoucherValidityKind.Absolute,
      fromUtc: asEpochMillis(raw.validFromUtc) ?? 0,
      toUtc: asEpochMillis(raw.validToUtc) ?? 0,
    };
  }
  return { kind: VoucherValidityKind.RelativeDays, days: num(raw.validDays) };
}

function mapTemplate(raw: Raw): VoucherTemplate {
  return {
    id: String(raw.id ?? ''),
    name: String(raw.name ?? ''),
    code: String(raw.code ?? ''),
    applyMode: num(raw.applyMode),
    rule: mapRule(raw),
    scopeKind: num(raw.scopeKind),
    scopeProductCodes: Array.isArray(raw.scopeProductCodes)
      ? (raw.scopeProductCodes as unknown[]).map((c) => String(c))
      : [],
    validity: mapValidity(raw),
    stackable: Boolean(raw.stackable),
    totalQuota: numOrNull(raw.totalQuota),
    issuedCount: num(raw.issuedCount),
    perUserLimit: numOrNull(raw.perUserLimit),
    status: num(raw.status),
    createdAtUtc: asEpochMillis(raw.createdAtUtc) ?? Date.now(),
    updatedAtUtc: asEpochMillis(raw.updatedAtUtc) ?? Date.now(),
  };
}

// 判别联合 → 平铺 wire：写回后端时展开 rule/validity 为后端期望的平铺字段。
function flattenRule(rule: VoucherRule): Record<string, unknown> {
  switch (rule.kind) {
    case VoucherDeductKind.Discount:
      return { deductKind: rule.kind, faceValue: rule.capValue, thresholdAmount: rule.thresholdAmount, discountRate: rule.discountRate };
    case VoucherDeductKind.FullReduction:
      return { deductKind: rule.kind, faceValue: rule.faceValue, thresholdAmount: rule.thresholdAmount, discountRate: null };
    default:
      return { deductKind: rule.kind, faceValue: rule.faceValue, thresholdAmount: 0, discountRate: null };
  }
}

function flattenValidity(v: VoucherValidity): Record<string, unknown> {
  if (v.kind === VoucherValidityKind.Absolute) {
    // 后端 DateTime 走 Unix 毫秒（EpochMillisNullableDateTimeConverter），不能发 ISO 字符串。
    return {
      validityKind: v.kind,
      validFromUtc: v.fromUtc,
      validToUtc: v.toUtc,
      validDays: null,
    };
  }
  return { validityKind: v.kind, validFromUtc: null, validToUtc: null, validDays: v.days };
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

function mapActivityItem(raw: Raw): ActivityVoucherItem {
  return {
    templateId: String(raw.templateId ?? ''),
    templateName: raw.templateName != null ? String(raw.templateName) : null,
    templateCode: raw.templateCode != null ? String(raw.templateCode) : null,
  };
}

function mapActivity(raw: Raw): VoucherActivity {
  // 兼容旧单券字段：后端尚未返回 items 时，用 templateId/templateName/templateCode 兜底成单元素数组。
  const items: ActivityVoucherItem[] = Array.isArray(raw.items)
    ? (raw.items as unknown[]).map((it) => mapActivityItem((it ?? {}) as Raw))
    : raw.templateId != null
      ? [mapActivityItem(raw)]
      : [];
  return {
    id: String(raw.id ?? ''),
    name: String(raw.name ?? ''),
    items,
    pickCount: Math.max(1, num(raw.pickCount, 1)),
    claimKey: String(raw.claimKey ?? ''),
    startAtUtc: asEpochMillisNullable(raw.startAtUtc),
    endAtUtc: asEpochMillisNullable(raw.endAtUtc),
    totalQuota: numOrNull(raw.totalQuota),
    claimedCount: num(raw.claimedCount),
    perUserLimit: numOrNull(raw.perUserLimit),
    status: num(raw.status),
    createdAtUtc: asEpochMillis(raw.createdAtUtc) ?? Date.now(),
  };
}

function mapClaimer(raw: Raw): ActivityClaimer {
  return {
    id: String(raw.id ?? ''),
    accountUid: String(raw.accountUid ?? ''),
    userVoucherId: String(raw.userVoucherId ?? ''),
    claimedAtUtc: asEpochMillis(raw.claimedAtUtc) ?? 0,
    claimIp: raw.claimIp != null ? String(raw.claimIp) : null,
    status: num(raw.status),
  };
}

function parseTemplate(value: unknown): AppResult<VoucherTemplate> {
  if (!value || typeof value !== 'object') return fail({ code: 'validation', message: '券批次数据格式错误' });
  return ok(mapTemplate(value as Raw));
}

function parseActivity(value: unknown): AppResult<VoucherActivity> {
  if (!value || typeof value !== 'object') return fail({ code: 'validation', message: '活动数据格式错误' });
  return ok(mapActivity(value as Raw));
}

export class VoucherHttpAdapter implements VoucherPort {
  async listTemplates(includeArchived = false): Promise<AppResult<VoucherTemplate[]>> {
    const res = await request<unknown>(TEMPLATES, {
      query: { includeArchived: includeArchived ? 'true' : undefined },
    });
    if (!res.success) return res;
    const rows = Array.isArray(res.data) ? res.data : [];
    return ok(rows.map((r) => mapTemplate((r ?? {}) as Raw)));
  }

  async getTemplate(id: string): Promise<AppResult<VoucherTemplate>> {
    const res = await request<unknown>(`${TEMPLATES}/${encodeURIComponent(id)}`);
    if (!res.success) return res;
    return parseTemplate(res.data);
  }

  async createTemplate(input: CreateVoucherTemplateInput): Promise<AppResult<VoucherTemplate>> {
    const body = {
      name: input.name,
      applyMode: input.applyMode,
      ...flattenRule(input.rule),
      scopeKind: input.scopeKind,
      scopeProductCodes: input.scopeProductCodes,
      ...flattenValidity(input.validity),
      stackable: input.stackable,
      totalQuota: input.totalQuota,
      perUserLimit: input.perUserLimit,
    };
    const res = await request<unknown>(TEMPLATES, { method: 'POST', body });
    if (!res.success) return res;
    return parseTemplate(res.data);
  }

  async updateTemplate(id: string, input: UpdateVoucherTemplateInput): Promise<AppResult<VoucherTemplate>> {
    const body = {
      name: input.name,
      scopeKind: input.scopeKind,
      scopeProductCodes: input.scopeProductCodes,
      ...flattenValidity(input.validity),
      stackable: input.stackable,
      totalQuota: input.totalQuota,
      perUserLimit: input.perUserLimit,
    };
    const res = await request<unknown>(`${TEMPLATES}/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body,
    });
    if (!res.success) return res;
    return parseTemplate(res.data);
  }

  async setTemplateStatus(id: string, status: number): Promise<AppResult<VoucherTemplate>> {
    const res = await request<unknown>(`${TEMPLATES}/${encodeURIComponent(id)}/status`, {
      method: 'POST',
      body: { status },
    });
    if (!res.success) return res;
    return parseTemplate(res.data);
  }

  async issue(id: string, input: IssueVouchersInput): Promise<AppResult<IssueVouchersResult>> {
    const res = await request<Raw>(`${TEMPLATES}/${encodeURIComponent(id)}/issue`, {
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
    const res = await request<boolean>(`${VOUCHERS}/${encodeURIComponent(userVoucherId)}/revoke`, {
      method: 'POST',
    });
    if (!res.success) return res;
    return ok(Boolean(res.data));
  }

  async listUserVouchers(accountUid: string, take = 100): Promise<AppResult<UserVoucher[]>> {
    const res = await request<unknown>(VOUCHERS, { query: { accountUid, take } });
    if (!res.success) return res;
    const rows = Array.isArray(res.data) ? res.data : [];
    return ok(rows.map((r) => mapUserVoucher((r ?? {}) as Raw)));
  }

  async listRedemptions(accountUid: string, take = 100): Promise<AppResult<VoucherRedemption[]>> {
    const res = await request<unknown>(`${VOUCHERS}/redemptions`, { query: { accountUid, take } });
    if (!res.success) return res;
    const rows = Array.isArray(res.data) ? res.data : [];
    return ok(rows.map((r) => mapRedemption((r ?? {}) as Raw)));
  }

  async listActivities(templateId?: string | null, includeEnded = false): Promise<AppResult<VoucherActivity[]>> {
    const res = await request<unknown>(ACTIVITIES, {
      query: {
        templateId: templateId || undefined,
        includeEnded: includeEnded ? 'true' : undefined,
      },
    });
    if (!res.success) return res;
    const rows = Array.isArray(res.data) ? res.data : [];
    return ok(rows.map((r) => mapActivity((r ?? {}) as Raw)));
  }

  async createActivity(input: CreateVoucherActivityInput): Promise<AppResult<VoucherActivity>> {
    const res = await request<unknown>(ACTIVITIES, { method: 'POST', body: input });
    if (!res.success) return res;
    return parseActivity(res.data);
  }

  async updateActivity(id: string, input: UpdateVoucherActivityInput): Promise<AppResult<VoucherActivity>> {
    const res = await request<unknown>(`${ACTIVITIES}/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: input,
    });
    if (!res.success) return res;
    return parseActivity(res.data);
  }

  async setActivityStatus(id: string, status: number): Promise<AppResult<VoucherActivity>> {
    const res = await request<unknown>(`${ACTIVITIES}/${encodeURIComponent(id)}/status`, {
      method: 'POST',
      body: { status },
    });
    if (!res.success) return res;
    return parseActivity(res.data);
  }

  async listActivityClaimers(activityId: string, take = 1000): Promise<AppResult<ActivityClaimer[]>> {
    const res = await request<unknown>(`${ACTIVITIES}/${encodeURIComponent(activityId)}/claimers`, {
      query: { take },
    });
    if (!res.success) return res;
    const rows = Array.isArray(res.data) ? res.data : [];
    return ok(rows.map((r) => mapClaimer((r ?? {}) as Raw)));
  }
}
