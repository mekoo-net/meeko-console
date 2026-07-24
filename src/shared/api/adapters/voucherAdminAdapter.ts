import {
  GrantConditionKind,
  VoucherActivityStatus,
  VoucherApplyMode,
  VoucherDeductKind,
  VoucherGrantRuleStatus,
  VoucherScopeKind,
  VoucherTemplateStatus,
  VoucherValidityKind,
  UserVoucherStatus,
  type ActivityClaimer,
  type ActivityVoucherItem,
  type CreateVoucherActivityInput,
  type CreateVoucherGrantRuleInput,
  type CreateVoucherTemplateInput,
  type IssueVouchersInput,
  type IssueVouchersResult,
  type UpdateVoucherActivityInput,
  type UpdateVoucherGrantRuleInput,
  type UpdateVoucherTemplateInput,
  type UserVoucher,
  type VoucherActivity,
  type VoucherGrantRule,
  type VoucherRedemption,
  type VoucherRule,
  type VoucherTemplate,
  type VoucherValidity,
} from '@/features/platform/vouchers/model/voucher.types';
import type {
  ListActivityClaimersInput,
  ListUserVouchersInput,
  ListVoucherActivitiesInput,
  ListVoucherGrantRulesInput,
  ListVoucherTemplatesInput,
  VoucherPort,
} from '@/features/platform/vouchers/services/ports/voucherPort';
import type { ListPage } from '@/shared/composables/useListQuery';
import { fail, ok, type AppResult } from '@/shared/api/httpTypes';
import { request } from '@/shared/api/httpClient';
import { asEpochMillis, asEpochMillisNullable } from '@/shared/lib/epoch';

const TEMPLATES = '/api/admin/billing/voucher/templates';
const ACTIVITIES = '/api/admin/billing/voucher/activities';
const GRANT_RULES = '/api/admin/billing/voucher/grant';
const VOUCHERS = '/api/admin/billing/vouchers';

type Raw = Record<string, unknown>;

const DEDUCT_KIND_FROM_WIRE: Record<string, number> = {
  no_threshold: VoucherDeductKind.NoThreshold,
  full_reduction: VoucherDeductKind.FullReduction,
  discount: VoucherDeductKind.Discount,
};

const DEDUCT_KIND_TO_WIRE: Record<number, string> = {
  [VoucherDeductKind.NoThreshold]: 'no_threshold',
  [VoucherDeductKind.FullReduction]: 'full_reduction',
  [VoucherDeductKind.Discount]: 'discount',
};

const APPLY_MODE_FROM_WIRE: Record<string, number> = {
  first_payment_only: VoucherApplyMode.FirstPaymentOnly,
  every_renewal: VoucherApplyMode.EveryRenewal,
};

const APPLY_MODE_TO_WIRE: Record<number, string> = {
  [VoucherApplyMode.FirstPaymentOnly]: 'first_payment_only',
  [VoucherApplyMode.EveryRenewal]: 'every_renewal',
};

const SCOPE_KIND_FROM_WIRE: Record<string, number> = {
  all_products: VoucherScopeKind.AllProducts,
  specific_products: VoucherScopeKind.SpecificProducts,
};

const SCOPE_KIND_TO_WIRE: Record<number, string> = {
  [VoucherScopeKind.AllProducts]: 'all_products',
  [VoucherScopeKind.SpecificProducts]: 'specific_products',
};

const VALIDITY_KIND_FROM_WIRE: Record<string, number> = {
  absolute: VoucherValidityKind.Absolute,
  relative_days: VoucherValidityKind.RelativeDays,
};

const VALIDITY_KIND_TO_WIRE: Record<number, string> = {
  [VoucherValidityKind.Absolute]: 'absolute',
  [VoucherValidityKind.RelativeDays]: 'relative_days',
};

const TEMPLATE_STATUS_FROM_WIRE: Record<string, number> = {
  draft: VoucherTemplateStatus.Draft,
  active: VoucherTemplateStatus.Active,
  paused: VoucherTemplateStatus.Paused,
  archived: VoucherTemplateStatus.Archived,
};

const TEMPLATE_STATUS_TO_WIRE: Record<number, string> = {
  [VoucherTemplateStatus.Draft]: 'draft',
  [VoucherTemplateStatus.Active]: 'active',
  [VoucherTemplateStatus.Paused]: 'paused',
  [VoucherTemplateStatus.Archived]: 'archived',
};

const ACTIVITY_STATUS_FROM_WIRE: Record<string, number> = {
  active: VoucherActivityStatus.Active,
  paused: VoucherActivityStatus.Paused,
  ended: VoucherActivityStatus.Ended,
};

const ACTIVITY_STATUS_TO_WIRE: Record<number, string> = {
  [VoucherActivityStatus.Active]: 'active',
  [VoucherActivityStatus.Paused]: 'paused',
  [VoucherActivityStatus.Ended]: 'ended',
};

const GRANT_RULE_STATUS_FROM_WIRE: Record<string, number> = {
  active: VoucherGrantRuleStatus.Active,
  paused: VoucherGrantRuleStatus.Paused,
  ended: VoucherGrantRuleStatus.Ended,
};

const GRANT_RULE_STATUS_TO_WIRE: Record<number, string> = {
  [VoucherGrantRuleStatus.Active]: 'active',
  [VoucherGrantRuleStatus.Paused]: 'paused',
  [VoucherGrantRuleStatus.Ended]: 'ended',
};

const GRANT_CONDITION_FROM_WIRE: Record<string, number> = {
  immediate: GrantConditionKind.Immediate,
  event_amount_at_least: GrantConditionKind.EventAmountAtLeast,
};

const GRANT_CONDITION_TO_WIRE: Record<number, string> = {
  [GrantConditionKind.Immediate]: 'immediate',
  [GrantConditionKind.EventAmountAtLeast]: 'event_amount_at_least',
};

const USER_VOUCHER_STATUS_FROM_WIRE: Record<string, number> = {
  unused: UserVoucherStatus.Unused,
  used: UserVoucherStatus.Used,
  expired: UserVoucherStatus.Expired,
  revoked: UserVoucherStatus.Revoked,
};

function num(value: unknown, fallback = 0): number {
  const n = typeof value === 'string' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) ? n : fallback;
}

function numOrNull(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = typeof value === 'string' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

function enumNum(map: Record<string, number>, value: unknown, fallback = 0): number {
  if (typeof value === 'string') return map[value] ?? fallback;
  return fallback;
}

function enumWire(map: Record<number, string>, value: number): string {
  return map[value] ?? String(value);
}

function parseListPage<T>(value: unknown, mapRow: (raw: Raw) => T): ListPage<T> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const obj = value as Raw;
    const rows = Array.isArray(obj.items) ? obj.items : [];
    return {
      items: rows.map((r) => mapRow((r ?? {}) as Raw)),
      total: num(obj.total, rows.length),
    };
  }
  const rows = Array.isArray(value) ? value : [];
  return {
    items: rows.map((r) => mapRow((r ?? {}) as Raw)),
    total: rows.length,
  };
}

// 平铺 wire → 判别联合：把券类型专属字段收进 rule，杜绝下游的可空字段兜底。
function mapRule(raw: Raw): VoucherRule {
  const faceValue = num(raw.faceValue);
  const thresholdAmount = num(raw.thresholdAmount);
  switch (enumNum(DEDUCT_KIND_FROM_WIRE, raw.deductKind)) {
    case VoucherDeductKind.Discount:
      return {
        kind: VoucherDeductKind.Discount,
        discountRate: num(raw.discountRate),
        capValue: faceValue,
        thresholdAmount,
      };
    case VoucherDeductKind.FullReduction:
      return { kind: VoucherDeductKind.FullReduction, faceValue, thresholdAmount };
    default:
      return { kind: VoucherDeductKind.NoThreshold, faceValue };
  }
}

function mapValidity(raw: Raw): VoucherValidity {
  if (enumNum(VALIDITY_KIND_FROM_WIRE, raw.validityKind) === VoucherValidityKind.Absolute) {
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
    applyMode: enumNum(APPLY_MODE_FROM_WIRE, raw.applyMode),
    rule: mapRule(raw),
    scopeKind: enumNum(SCOPE_KIND_FROM_WIRE, raw.scopeKind),
    scopeProductCodes: Array.isArray(raw.scopeProductCodes)
      ? (raw.scopeProductCodes as unknown[]).map((c) => String(c))
      : [],
    validity: mapValidity(raw),
    stackable: Boolean(raw.stackable),
    totalQuota: numOrNull(raw.totalQuota),
    issuedCount: num(raw.issuedCount),
    perUserLimit: numOrNull(raw.perUserLimit),
    status: enumNum(TEMPLATE_STATUS_FROM_WIRE, raw.status),
    createdAtUtc: asEpochMillis(raw.createdAtUtc) ?? Date.now(),
    updatedAtUtc: asEpochMillis(raw.updatedAtUtc) ?? Date.now(),
  };
}

// 判别联合 → 平铺 wire：写回后端时展开 rule/validity 为后端期望的平铺字段（snake_case 枚举）。
function flattenRule(rule: VoucherRule): Record<string, unknown> {
  switch (rule.kind) {
    case VoucherDeductKind.Discount:
      return {
        deductKind: enumWire(DEDUCT_KIND_TO_WIRE, rule.kind),
        faceValue: rule.capValue,
        thresholdAmount: rule.thresholdAmount,
        discountRate: rule.discountRate,
      };
    case VoucherDeductKind.FullReduction:
      return {
        deductKind: enumWire(DEDUCT_KIND_TO_WIRE, rule.kind),
        faceValue: rule.faceValue,
        thresholdAmount: rule.thresholdAmount,
        discountRate: null,
      };
    default:
      return {
        deductKind: enumWire(DEDUCT_KIND_TO_WIRE, rule.kind),
        faceValue: rule.faceValue,
        thresholdAmount: 0,
        discountRate: null,
      };
  }
}

function flattenValidity(v: VoucherValidity): Record<string, unknown> {
  if (v.kind === VoucherValidityKind.Absolute) {
    return {
      validityKind: enumWire(VALIDITY_KIND_TO_WIRE, v.kind),
      validFromUtc: new Date(v.fromUtc).toISOString(),
      validToUtc: new Date(v.toUtc).toISOString(),
      validDays: null,
    };
  }
  return {
    validityKind: enumWire(VALIDITY_KIND_TO_WIRE, v.kind),
    validFromUtc: null,
    validToUtc: null,
    validDays: v.days,
  };
}

function mapUserVoucher(raw: Raw): UserVoucher {
  return {
    id: String(raw.id ?? ''),
    templateId: String(raw.templateId ?? ''),
    accountUid: String(raw.accountUid ?? ''),
    serialNo: raw.serialNo != null ? String(raw.serialNo) : null,
    deductKind: enumNum(DEDUCT_KIND_FROM_WIRE, raw.deductKind),
    faceValue: num(raw.faceValue),
    thresholdAmount: num(raw.thresholdAmount),
    remainingValue: num(raw.remainingValue),
    validFromUtc: asEpochMillis(raw.validFromUtc) ?? 0,
    validToUtc: asEpochMillis(raw.validToUtc) ?? 0,
    status: enumNum(USER_VOUCHER_STATUS_FROM_WIRE, raw.status),
    issuedAtUtc: asEpochMillis(raw.issuedAtUtc) ?? 0,
  };
}

function mapRedemption(raw: Raw): VoucherRedemption {
  return {
    id: String(raw.id ?? ''),
    userVoucherId: String(raw.userVoucherId ?? ''),
    accountUid: String(raw.accountUid ?? ''),
    kind: num(raw.kind),
    delta: num(raw.delta),
    balanceAfter: num(raw.balanceAfter),
    occurredAtUtc: asEpochMillis(raw.occurredAtUtc) ?? 0,
    holdId: raw.holdId === undefined || raw.holdId === null ? '' : String(raw.holdId),
    referenceKind: num(raw.referenceKind),
    referenceId:
      raw.referenceId === undefined || raw.referenceId === null
        ? null
        : String(raw.referenceId),
    productCode: String(raw.productCode ?? ''),
    billAmount: num(raw.billAmount),
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
    status: enumNum(ACTIVITY_STATUS_FROM_WIRE, raw.status),
    createdAtUtc: asEpochMillis(raw.createdAtUtc) ?? Date.now(),
  };
}

function mapGrantRule(raw: Raw): VoucherGrantRule {
  const items: ActivityVoucherItem[] = Array.isArray(raw.items)
    ? (raw.items as unknown[]).map((it) => mapActivityItem((it ?? {}) as Raw))
    : [];
  return {
    id: String(raw.id ?? ''),
    name: String(raw.name ?? ''),
    triggerEventType: String(raw.triggerEventType ?? ''),
    conditionKind: enumNum(GRANT_CONDITION_FROM_WIRE, raw.conditionKind),
    thresholdAmount: numOrNull(raw.thresholdAmount),
    scopeProductCode: raw.scopeProductCode != null ? String(raw.scopeProductCode) : null,
    items,
    startAtUtc: asEpochMillisNullable(raw.startAtUtc),
    endAtUtc: asEpochMillisNullable(raw.endAtUtc),
    totalQuota: numOrNull(raw.totalQuota),
    grantedCount: num(raw.grantedCount),
    perUserLimit: numOrNull(raw.perUserLimit),
    status: enumNum(GRANT_RULE_STATUS_FROM_WIRE, raw.status),
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
    status: enumNum(USER_VOUCHER_STATUS_FROM_WIRE, raw.status),
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

function parseGrantRule(value: unknown): AppResult<VoucherGrantRule> {
  if (!value || typeof value !== 'object')
    return fail({ code: 'validation', message: '发券规则数据格式错误' });
  return ok(mapGrantRule(value as Raw));
}

export class VoucherHttpAdapter implements VoucherPort {
  async listTemplates(input: ListVoucherTemplatesInput): Promise<AppResult<ListPage<VoucherTemplate>>> {
    const res = await request<unknown>(TEMPLATES, {
      query: {
        includeArchived: input.includeArchived ? 'true' : undefined,
        page: input.page,
        pageSize: input.pageSize,
      },
    });
    if (!res.success) return res;
    return ok(parseListPage(res.data, mapTemplate));
  }

  async getTemplate(id: string): Promise<AppResult<VoucherTemplate>> {
    const res = await request<unknown>(`${TEMPLATES}/${encodeURIComponent(id)}`);
    if (!res.success) return res;
    return parseTemplate(res.data);
  }

  async createTemplate(input: CreateVoucherTemplateInput): Promise<AppResult<VoucherTemplate>> {
    const body = {
      name: input.name,
      applyMode: enumWire(APPLY_MODE_TO_WIRE, input.applyMode),
      ...flattenRule(input.rule),
      scopeKind: enumWire(SCOPE_KIND_TO_WIRE, input.scopeKind),
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
      scopeKind: enumWire(SCOPE_KIND_TO_WIRE, input.scopeKind),
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
      body: { status: enumWire(TEMPLATE_STATUS_TO_WIRE, status) },
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

  async listUserVouchers(input: ListUserVouchersInput): Promise<AppResult<ListPage<UserVoucher>>> {
    const res = await request<unknown>(VOUCHERS, {
      query: {
        accountUid: input.accountUid,
        page: input.page,
        pageSize: input.pageSize,
      },
    });
    if (!res.success) return res;
    return ok(parseListPage(res.data, mapUserVoucher));
  }

  async listRedemptions(accountUid: string, take = 100): Promise<AppResult<VoucherRedemption[]>> {
    const res = await request<unknown>(`${VOUCHERS}/redemptions`, { query: { accountUid, take } });
    if (!res.success) return res;
    const rows = Array.isArray(res.data) ? res.data : [];
    return ok(rows.map((r) => mapRedemption((r ?? {}) as Raw)));
  }

  async listLedger(accountUid: string, take = 100): Promise<AppResult<VoucherRedemption[]>> {
    const res = await request<unknown>(`${VOUCHERS}/ledger`, { query: { accountUid, take } });
    if (!res.success) return res;
    const rows = Array.isArray(res.data) ? res.data : [];
    return ok(rows.map((r) => mapRedemption((r ?? {}) as Raw)));
  }

  async listRedemptionsByVoucher(userVoucherId: string, take = 100): Promise<AppResult<VoucherRedemption[]>> {
    const res = await request<unknown>(`${VOUCHERS}/redemptions/by-voucher`, {
      query: { userVoucherId, take },
    });
    if (!res.success) return res;
    const rows = Array.isArray(res.data) ? res.data : [];
    return ok(rows.map((r) => mapRedemption((r ?? {}) as Raw)));
  }

  async listLedgerByVoucher(userVoucherId: string, take = 100): Promise<AppResult<VoucherRedemption[]>> {
    const res = await request<unknown>(`${VOUCHERS}/ledger/by-voucher`, {
      query: { userVoucherId, take },
    });
    if (!res.success) return res;
    const rows = Array.isArray(res.data) ? res.data : [];
    return ok(rows.map((r) => mapRedemption((r ?? {}) as Raw)));
  }

  async listRedemptionsByBill(holdId: string): Promise<AppResult<VoucherRedemption[]>> {
    const res = await request<unknown>(`${VOUCHERS}/redemptions/by-bill`, { query: { holdId } });
    if (!res.success) return res;
    const rows = Array.isArray(res.data) ? res.data : [];
    return ok(rows.map((r) => mapRedemption((r ?? {}) as Raw)));
  }

  async listLedgerByBill(holdId: string): Promise<AppResult<VoucherRedemption[]>> {
    const res = await request<unknown>(`${VOUCHERS}/ledger/by-bill`, { query: { holdId } });
    if (!res.success) return res;
    const rows = Array.isArray(res.data) ? res.data : [];
    return ok(rows.map((r) => mapRedemption((r ?? {}) as Raw)));
  }

  async listActivities(input: ListVoucherActivitiesInput): Promise<AppResult<ListPage<VoucherActivity>>> {
    const res = await request<unknown>(ACTIVITIES, {
      query: {
        templateId: input.templateId || undefined,
        includeEnded: input.includeEnded ? 'true' : undefined,
        page: input.page,
        pageSize: input.pageSize,
      },
    });
    if (!res.success) return res;
    return ok(parseListPage(res.data, mapActivity));
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
      body: { status: enumWire(ACTIVITY_STATUS_TO_WIRE, status) },
    });
    if (!res.success) return res;
    return parseActivity(res.data);
  }

  async listActivityClaimers(
    input: ListActivityClaimersInput,
  ): Promise<AppResult<ListPage<ActivityClaimer>>> {
    const res = await request<unknown>(
      `${ACTIVITIES}/${encodeURIComponent(input.activityId)}/claimers`,
      {
        query: {
          page: input.page,
          pageSize: input.pageSize,
          keyword: input.accountUid ?? undefined,
          status: input.status ?? undefined,
        },
      },
    );
    if (!res.success) return res;
    return ok(parseListPage(res.data, mapClaimer));
  }

  async listGrantRules(
    input: ListVoucherGrantRulesInput,
  ): Promise<AppResult<ListPage<VoucherGrantRule>>> {
    const res = await request<unknown>(GRANT_RULES, {
      query: {
        triggerEventType: input.triggerEventType || undefined,
        includeEnded: input.includeEnded ? 'true' : undefined,
        page: input.page,
        pageSize: input.pageSize,
      },
    });
    if (!res.success) return res;
    return ok(parseListPage(res.data, mapGrantRule));
  }

  async createGrantRule(input: CreateVoucherGrantRuleInput): Promise<AppResult<VoucherGrantRule>> {
    const body = {
      name: input.name,
      triggerEventType: input.triggerEventType,
      conditionKind: enumWire(GRANT_CONDITION_TO_WIRE, input.conditionKind),
      templateIds: input.templateIds,
      thresholdAmount: input.thresholdAmount,
      scopeProductCode: input.scopeProductCode,
      startAtUtc: input.startAtUtc,
      endAtUtc: input.endAtUtc,
      totalQuota: input.totalQuota,
      perUserLimit: input.perUserLimit,
    };
    const res = await request<unknown>(GRANT_RULES, { method: 'POST', body });
    if (!res.success) return res;
    return parseGrantRule(res.data);
  }

  async updateGrantRule(
    id: string,
    input: UpdateVoucherGrantRuleInput,
  ): Promise<AppResult<VoucherGrantRule>> {
    const body = {
      name: input.name,
      thresholdAmount: input.thresholdAmount,
      scopeProductCode: input.scopeProductCode,
      startAtUtc: input.startAtUtc,
      endAtUtc: input.endAtUtc,
      totalQuota: input.totalQuota,
      perUserLimit: input.perUserLimit,
    };
    const res = await request<unknown>(`${GRANT_RULES}/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body,
    });
    if (!res.success) return res;
    return parseGrantRule(res.data);
  }

  async setGrantRuleStatus(id: string, status: number): Promise<AppResult<VoucherGrantRule>> {
    const res = await request<unknown>(`${GRANT_RULES}/${encodeURIComponent(id)}/status`, {
      method: 'POST',
      body: { status: enumWire(GRANT_RULE_STATUS_TO_WIRE, status) },
    });
    if (!res.success) return res;
    return parseGrantRule(res.data);
  }
}
