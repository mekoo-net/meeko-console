import type { AppResult } from '@/shared/api/httpTypes';
import { ok, fail } from '@/shared/api/httpTypes';
import { clientPaginate } from '@/shared/composables/usePagination';

import {
  GrantConditionKind,
  GrantTriggerEvent,
  VoucherGrantRuleStatus,
  VoucherTemplateStatus,
  UserVoucherStatus,
  VoucherActivityStatus,
  VoucherDeductKind,
  VoucherLedgerKind,
  VoucherValidityKind,
  type ActivityClaimer,
  type TemplateIssued,
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
  type VoucherTemplate,
} from '../../model/voucher.types';
import type {
  ListActivityClaimersInput,
  ListTemplateIssuedInput,
  ListUserVouchersInput,
  ListVoucherActivitiesInput,
  ListVoucherGrantRulesInput,
  ListVoucherTemplatesInput,
  VoucherPort,
} from '../ports/voucherPort';

let seq = 100;
const nextId = (): string => String(++seq);

const templates: VoucherTemplate[] = [
  {
    id: '1',
    name: '新用户无门槛 5 元券',
    code: 'VC-DEMO0001',
    applyMode: 0,
    rule: { kind: VoucherDeductKind.NoThreshold, faceValue: 5 },
    scopeKind: 0,
    scopeProductCodes: [],
    validity: { kind: VoucherValidityKind.RelativeDays, days: 30 },
    stackable: false,
    totalQuota: 1000,
    issuedCount: 12,
    perUserLimit: 1,
    status: VoucherTemplateStatus.Active,
    createdAtUtc: Date.now() - 86400000,
    updatedAtUtc: Date.now() - 86400000,
  },
];

const userVouchers: UserVoucher[] = [];
const redemptions: VoucherRedemption[] = [];

interface MockActivity extends VoucherActivity {
  claimers: ActivityClaimer[];
}

function toWireActivity(a: MockActivity): VoucherActivity {
  const { claimers, ...rest } = a;
  void claimers;
  return { ...rest };
}

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const randToken = (n: number): string =>
  Array.from({ length: n }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('');
const randClaimKey = (): string => `${randToken(4)}-${randToken(4)}`;

const activities: MockActivity[] = [
  {
    id: '50',
    name: '新人注册领券',
    items: [{ templateId: '1', templateName: '新用户无门槛 5 元券', templateCode: 'VC-DEMO0001' }],
    pickCount: 1,
    claimKey: 'NEW-USER',
    startAtUtc: Date.now() - 7 * 86400000,
    endAtUtc: Date.now() + 30 * 86400000,
    totalQuota: 1000,
    claimedCount: 12,
    perUserLimit: 1,
    status: VoucherActivityStatus.Active,
    createdAtUtc: Date.now() - 7 * 86400000,
    claimers: Array.from({ length: 12 }, (_, i) => ({
      id: `cl${i}`,
      accountUid: String(100000000000 + i),
      userVoucherId: `uv${i}`,
      claimedAtUtc: Date.now() - i * 3600000,
      claimIp: `203.0.113.${10 + i}`,
      status: i % 3 === 0 ? UserVoucherStatus.Used : UserVoucherStatus.Unused,
      contact: {
        uid: String(100000000000 + i),
        displayName: `演示账户 ${i + 1}`,
        email: `claimer${i + 1}@example.com`,
        type: i % 4 === 0 ? ('organization' as const) : ('personal' as const),
      },
    })),
  },
];

interface MockIssued extends TemplateIssued {
  templateId: string;
}

const issuedRows: MockIssued[] = activities[0]!.claimers.map((c, i) => ({
  id: c.userVoucherId,
  templateId: '1',
  accountUid: c.accountUid,
  serialNo: `VC${String(i + 1).padStart(6, '0')}`,
  faceValue: 5,
  remainingValue: c.status === UserVoucherStatus.Used ? 0 : 5,
  status: c.status,
  issuedAtUtc: c.claimedAtUtc,
  validToUtc: c.claimedAtUtc + 30 * 86400000,
  origin: 'activity:50',
  contact: c.contact,
}));

const grantRules: VoucherGrantRule[] = [
  {
    id: '70',
    name: '新人注册礼包',
    triggerEventType: GrantTriggerEvent.AccountRegistered,
    conditionKind: GrantConditionKind.Immediate,
    thresholdAmount: null,
    scopeProductCode: null,
    items: [{ templateId: '1', templateName: '新用户无门槛 5 元券', templateCode: 'VC-DEMO0001' }],
    startAtUtc: null,
    endAtUtc: null,
    totalQuota: null,
    grantedCount: 34,
    perUserLimit: 1,
    status: VoucherGrantRuleStatus.Active,
    createdAtUtc: Date.now() - 14 * 86400000,
  },
  {
    id: '71',
    name: '充值满 100 送券',
    triggerEventType: GrantTriggerEvent.RechargeSucceeded,
    conditionKind: GrantConditionKind.EventAmountAtLeast,
    thresholdAmount: 100,
    scopeProductCode: null,
    items: [{ templateId: '1', templateName: '新用户无门槛 5 元券', templateCode: 'VC-DEMO0001' }],
    startAtUtc: Date.now() - 3 * 86400000,
    endAtUtc: Date.now() + 27 * 86400000,
    totalQuota: 5000,
    grantedCount: 128,
    perUserLimit: null,
    status: VoucherGrantRuleStatus.Active,
    createdAtUtc: Date.now() - 3 * 86400000,
  },
];

export class VoucherMock implements VoucherPort {
  async listTemplates(input: ListVoucherTemplatesInput) {
    const rows = (input.includeArchived
      ? templates
      : templates.filter((t) => t.status !== VoucherTemplateStatus.Archived)
    ).map((t) => ({ ...t }));
    return ok({
      items: clientPaginate(rows, input.page, input.pageSize),
      total: rows.length,
    });
  }

  async getTemplate(id: string): Promise<AppResult<VoucherTemplate>> {
    const t = templates.find((x) => x.id === id);
    return t ? ok({ ...t }) : fail({ code: 'not_found', message: '券批次不存在' });
  }

  async createTemplate(input: CreateVoucherTemplateInput): Promise<AppResult<VoucherTemplate>> {
    const now = Date.now();
    const t: VoucherTemplate = {
      id: nextId(),
      name: input.name,
      code: `VC-${randToken(8)}`,
      applyMode: input.applyMode,
      rule: input.rule,
      scopeKind: input.scopeKind,
      scopeProductCodes: [...input.scopeProductCodes],
      validity: input.validity,
      stackable: input.stackable,
      totalQuota: input.totalQuota ?? null,
      issuedCount: 0,
      perUserLimit: input.perUserLimit ?? null,
      status: VoucherTemplateStatus.Active,
      createdAtUtc: now,
      updatedAtUtc: now,
    };
    templates.unshift(t);
    return ok({ ...t });
  }

  async updateTemplate(id: string, input: UpdateVoucherTemplateInput): Promise<AppResult<VoucherTemplate>> {
    const idx = templates.findIndex((x) => x.id === id);
    if (idx < 0) return fail({ code: 'not_found', message: '券批次不存在' });
    const cur = templates[idx]!;
    const next: VoucherTemplate = {
      ...cur,
      name: input.name,
      scopeKind: input.scopeKind,
      scopeProductCodes: [...input.scopeProductCodes],
      validity: input.validity,
      stackable: input.stackable,
      totalQuota: input.totalQuota ?? null,
      perUserLimit: input.perUserLimit ?? null,
      updatedAtUtc: Date.now(),
    };
    templates[idx] = next;
    return ok({ ...next });
  }

  async setTemplateStatus(id: string, status: number): Promise<AppResult<VoucherTemplate>> {
    const t = templates.find((x) => x.id === id);
    if (!t) return fail({ code: 'not_found', message: '券批次不存在' });
    t.status = status;
    t.updatedAtUtc = Date.now();
    return ok({ ...t });
  }

  async issue(id: string, input: IssueVouchersInput): Promise<AppResult<IssueVouchersResult>> {
    const t = templates.find((x) => x.id === id);
    if (!t) return fail({ code: 'not_found', message: '券批次不存在' });
    const now = Date.now();
    // 发券时把模板的判别联合「快照」成平铺的用户券实例。
    const faceValue = t.rule.kind === VoucherDeductKind.Discount ? t.rule.capValue : t.rule.faceValue;
    const thresholdAmount = t.rule.kind === VoucherDeductKind.NoThreshold ? 0 : t.rule.thresholdAmount;
    const days = t.validity.kind === VoucherValidityKind.RelativeDays ? t.validity.days : 30;
    let issued = 0;
    for (const uid of input.accountUids) {
      if (!uid) continue;
      const id = nextId();
      userVouchers.unshift({
        id,
        templateId: t.id,
        accountUid: uid,
        serialNo: `VC${id}`,
        deductKind: t.rule.kind,
        faceValue,
        thresholdAmount,
        remainingValue: faceValue,
        validFromUtc: now,
        validToUtc: now + days * 86400000,
        status: UserVoucherStatus.Unused,
        issuedAtUtc: now,
      });
      issuedRows.unshift({
        id,
        templateId: t.id,
        accountUid: uid,
        serialNo: `VC${id}`,
        faceValue,
        remainingValue: faceValue,
        status: UserVoucherStatus.Unused,
        issuedAtUtc: now,
        validToUtc: now + days * 86400000,
        origin: null,
      });
      issued++;
    }
    t.issuedCount += issued;
    return ok({ issuedCount: issued, requestedCount: input.accountUids.length });
  }

  async listTemplateIssued(input: ListTemplateIssuedInput) {
    let rows = issuedRows.filter((v) => v.templateId === input.templateId);
    if (input.accountUid) rows = rows.filter((c) => c.accountUid === input.accountUid);
    if (input.status != null) rows = rows.filter((c) => c.status === input.status);
    return ok({
      items: clientPaginate(
        rows.map((row) => {
          const { templateId, ...rest } = row;
          void templateId;
          return rest;
        }),
        input.page,
        input.pageSize,
      ),
      total: rows.length,
    });
  }

  async revoke(userVoucherId: string): Promise<AppResult<boolean>> {
    const v = userVouchers.find((x) => x.id === userVoucherId);
    if (!v) return fail({ code: 'not_found', message: '用户券不存在' });
    if (v.status !== UserVoucherStatus.Unused)
      return fail({ code: 'conflict', message: '仅未使用的券可作废' });
    v.status = UserVoucherStatus.Revoked;
    return ok(true);
  }

  async listUserVouchers(input: ListUserVouchersInput) {
    const rows = userVouchers
      .filter((v) => v.accountUid === input.accountUid)
      .map((v) => ({ ...v }));
    return ok({
      items: clientPaginate(rows, input.page, input.pageSize),
      total: rows.length,
    });
  }

  async listRedemptions(accountUid: string): Promise<AppResult<VoucherRedemption[]>> {
    return ok(redemptions.filter((r) => r.accountUid === accountUid).map((r) => ({ ...r })));
  }

  async listLedger(accountUid: string): Promise<AppResult<VoucherRedemption[]>> {
    return ok(redemptions.filter((r) => r.accountUid === accountUid).map((r) => ({ ...r })));
  }

  async listRedemptionsByVoucher(userVoucherId: string): Promise<AppResult<VoucherRedemption[]>> {
    return ok(redemptions.filter((r) => r.userVoucherId === userVoucherId).map((r) => ({ ...r })));
  }

  async listLedgerByVoucher(userVoucherId: string): Promise<AppResult<VoucherRedemption[]>> {
    return ok(redemptions.filter((r) => r.userVoucherId === userVoucherId).map((r) => ({ ...r })));
  }

  async listRedemptionsByBill(holdId: string): Promise<AppResult<VoucherRedemption[]>> {
    return ok(
      redemptions
        .filter((r) => r.holdId === holdId && r.kind === VoucherLedgerKind.Redeem)
        .map((r) => ({ ...r })),
    );
  }

  async listLedgerByBill(holdId: string): Promise<AppResult<VoucherRedemption[]>> {
    return ok(redemptions.filter((r) => r.holdId === holdId).map((r) => ({ ...r })));
  }

  async listActivities(input: ListVoucherActivitiesInput) {
    let rows = activities.slice();
    if (input.templateId) rows = rows.filter((a) => a.items.some((i) => i.templateId === input.templateId));
    if (!input.includeEnded) rows = rows.filter((a) => a.status !== VoucherActivityStatus.Ended);
    const mapped = rows.map((a) => toWireActivity(a));
    return ok({
      items: clientPaginate(mapped, input.page, input.pageSize),
      total: mapped.length,
    });
  }

  async createActivity(input: CreateVoucherActivityInput): Promise<AppResult<VoucherActivity>> {
    const picked = input.templateIds
      .map((id) => templates.find((t) => t.id === id))
      .filter((t): t is VoucherTemplate => !!t);
    if (picked.length === 0) return fail({ code: 'not_found', message: '券模板不存在' });
    const pickCount = Math.min(Math.max(1, input.pickCount), picked.length);
    const now = Date.now();
    const activity: MockActivity = {
      id: nextId(),
      name: input.name.trim() || '领券活动',
      items: picked.map((t) => ({ templateId: t.id, templateName: t.name, templateCode: t.code })),
      pickCount,
      claimKey: randClaimKey(),
      startAtUtc: input.startAtUtc ?? null,
      endAtUtc: input.endAtUtc ?? null,
      totalQuota: input.totalQuota ?? null,
      claimedCount: 0,
      perUserLimit: input.perUserLimit ?? null,
      status: VoucherActivityStatus.Active,
      createdAtUtc: now,
      claimers: [],
    };
    activities.unshift(activity);
    return ok(toWireActivity(activity));
  }

  async updateActivity(id: string, input: UpdateVoucherActivityInput): Promise<AppResult<VoucherActivity>> {
    const a = activities.find((x) => x.id === id);
    if (!a) return fail({ code: 'not_found', message: '活动不存在' });
    a.name = input.name.trim() || a.name;
    a.startAtUtc = input.startAtUtc ?? null;
    a.endAtUtc = input.endAtUtc ?? null;
    a.totalQuota = input.totalQuota ?? null;
    a.perUserLimit = input.perUserLimit ?? null;
    return ok(toWireActivity(a));
  }

  async setActivityStatus(id: string, status: number): Promise<AppResult<VoucherActivity>> {
    const a = activities.find((x) => x.id === id);
    if (!a) return fail({ code: 'not_found', message: '活动不存在' });
    a.status = status;
    return ok(toWireActivity(a));
  }

  async listActivityClaimers(input: ListActivityClaimersInput) {
    const a = activities.find((x) => x.id === input.activityId);
    if (!a) return fail({ code: 'not_found', message: '活动不存在' });
    let rows = a.claimers.map((c) => ({ ...c }));
    if (input.accountUid) rows = rows.filter((c) => c.accountUid === input.accountUid);
    if (input.status != null) rows = rows.filter((c) => c.status === input.status);
    return ok({
      items: clientPaginate(rows, input.page, input.pageSize),
      total: rows.length,
    });
  }

  async listGrantRules(input: ListVoucherGrantRulesInput) {
    let rows = grantRules.slice();
    if (input.triggerEventType)
      rows = rows.filter((r) => r.triggerEventType === input.triggerEventType);
    if (!input.includeEnded) rows = rows.filter((r) => r.status !== VoucherGrantRuleStatus.Ended);
    const mapped = rows.map((r) => ({ ...r }));
    return ok({
      items: clientPaginate(mapped, input.page, input.pageSize),
      total: mapped.length,
    });
  }

  async createGrantRule(input: CreateVoucherGrantRuleInput): Promise<AppResult<VoucherGrantRule>> {
    const picked = input.templateIds
      .map((id) => templates.find((t) => t.id === id))
      .filter((t): t is VoucherTemplate => !!t);
    if (picked.length === 0) return fail({ code: 'not_found', message: '券模板不存在' });
    const rule: VoucherGrantRule = {
      id: nextId(),
      name: input.name.trim() || '发券规则',
      triggerEventType: input.triggerEventType,
      conditionKind: input.conditionKind,
      thresholdAmount: input.thresholdAmount ?? null,
      scopeProductCode: input.scopeProductCode ?? null,
      items: picked.map((t) => ({ templateId: t.id, templateName: t.name, templateCode: t.code })),
      startAtUtc: input.startAtUtc ?? null,
      endAtUtc: input.endAtUtc ?? null,
      totalQuota: input.totalQuota ?? null,
      grantedCount: 0,
      perUserLimit: input.perUserLimit ?? null,
      status: VoucherGrantRuleStatus.Active,
      createdAtUtc: Date.now(),
    };
    grantRules.unshift(rule);
    return ok({ ...rule });
  }

  async updateGrantRule(
    id: string,
    input: UpdateVoucherGrantRuleInput,
  ): Promise<AppResult<VoucherGrantRule>> {
    const r = grantRules.find((x) => x.id === id);
    if (!r) return fail({ code: 'not_found', message: '发券规则不存在' });
    r.name = input.name.trim() || r.name;
    r.thresholdAmount = input.thresholdAmount ?? null;
    r.scopeProductCode = input.scopeProductCode ?? null;
    r.startAtUtc = input.startAtUtc ?? null;
    r.endAtUtc = input.endAtUtc ?? null;
    r.totalQuota = input.totalQuota ?? null;
    r.perUserLimit = input.perUserLimit ?? null;
    return ok({ ...r });
  }

  async setGrantRuleStatus(id: string, status: number): Promise<AppResult<VoucherGrantRule>> {
    const r = grantRules.find((x) => x.id === id);
    if (!r) return fail({ code: 'not_found', message: '发券规则不存在' });
    r.status = status;
    return ok({ ...r });
  }
}
