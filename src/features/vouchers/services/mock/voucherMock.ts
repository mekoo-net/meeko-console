import type { AppResult } from '@/shared/api/httpTypes';
import { ok, fail } from '@/shared/api/httpTypes';
import { clientPaginate } from '@/shared/composables/usePagination';

import {
  VoucherTemplateStatus,
  UserVoucherStatus,
  VoucherActivityStatus,
  VoucherDeductKind,
  VoucherValidityKind,
  type ActivityClaimer,
  type CreateVoucherActivityInput,
  type CreateVoucherTemplateInput,
  type IssueVouchersInput,
  type IssueVouchersResult,
  type UpdateVoucherActivityInput,
  type UpdateVoucherTemplateInput,
  type UserVoucher,
  type VoucherActivity,
  type VoucherRedemption,
  type VoucherTemplate,
} from '../../model/voucher.types';
import type {
  ListUserVouchersInput,
  ListVoucherActivitiesInput,
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
    })),
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
      userVouchers.unshift({
        id: nextId(),
        templateId: t.id,
        accountUid: uid,
        serialNo: `VC${nextId()}`,
        deductKind: t.rule.kind,
        faceValue,
        thresholdAmount,
        remainingValue: faceValue,
        validFromUtc: now,
        validToUtc: now + days * 86400000,
        status: UserVoucherStatus.Unused,
        issuedAtUtc: now,
      });
      issued++;
    }
    t.issuedCount += issued;
    return ok({ issuedCount: issued, requestedCount: input.accountUids.length });
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

  async listActivityClaimers(activityId: string, take = 1000): Promise<AppResult<ActivityClaimer[]>> {
    const a = activities.find((x) => x.id === activityId);
    if (!a) return fail({ code: 'not_found', message: '活动不存在' });
    return ok(a.claimers.slice(0, take).map((c) => ({ ...c })));
  }
}
