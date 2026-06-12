import type { AppResult } from '@/shared/api/httpTypes';
import { ok, fail } from '@/shared/api/httpTypes';

import {
  VoucherTemplateStatus,
  UserVoucherStatus,
  type CreateVoucherTemplateInput,
  type IssueVouchersInput,
  type IssueVouchersResult,
  type UpdateVoucherTemplateInput,
  type UserVoucher,
  type VoucherRedemption,
  type VoucherTemplate,
} from '../../model/voucher.types';
import type { VoucherPort } from '../ports/voucherPort';

let seq = 100;
const nextId = (): string => String(++seq);

const templates: VoucherTemplate[] = [
  {
    id: '1',
    name: '新用户无门槛 5 元券',
    deductKind: 0,
    faceValue: 5,
    thresholdAmount: 0,
    discountRate: null,
    scopeKind: 0,
    scopeProductCodes: [],
    validityKind: 1,
    validFromUtc: null,
    validToUtc: null,
    validDays: 30,
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

export class VoucherMock implements VoucherPort {
  async listTemplates(includeArchived = false): Promise<AppResult<VoucherTemplate[]>> {
    const rows = includeArchived
      ? templates
      : templates.filter((t) => t.status !== VoucherTemplateStatus.Archived);
    return ok(rows.map((t) => ({ ...t })));
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
      deductKind: input.deductKind,
      faceValue: input.faceValue,
      thresholdAmount: input.thresholdAmount,
      discountRate: input.discountRate ?? null,
      scopeKind: input.scopeKind,
      scopeProductCodes: [...input.scopeProductCodes],
      validityKind: input.validityKind,
      validFromUtc: input.validFromUtc ? Date.parse(input.validFromUtc) : null,
      validToUtc: input.validToUtc ? Date.parse(input.validToUtc) : null,
      validDays: input.validDays ?? null,
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
      validityKind: input.validityKind,
      validFromUtc: input.validFromUtc ? Date.parse(input.validFromUtc) : null,
      validToUtc: input.validToUtc ? Date.parse(input.validToUtc) : null,
      validDays: input.validDays ?? null,
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
    let issued = 0;
    for (const uid of input.accountUids) {
      if (!uid) continue;
      userVouchers.unshift({
        id: nextId(),
        templateId: t.id,
        accountUid: uid,
        serialNo: `VC${nextId()}`,
        deductKind: t.deductKind,
        faceValue: t.faceValue,
        thresholdAmount: t.thresholdAmount,
        remainingValue: t.faceValue,
        validFromUtc: now,
        validToUtc: now + (t.validDays ?? 30) * 86400000,
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

  async listUserVouchers(accountUid: string): Promise<AppResult<UserVoucher[]>> {
    return ok(userVouchers.filter((v) => v.accountUid === accountUid).map((v) => ({ ...v })));
  }

  async listRedemptions(accountUid: string): Promise<AppResult<VoucherRedemption[]>> {
    return ok(redemptions.filter((r) => r.accountUid === accountUid).map((r) => ({ ...r })));
  }
}
