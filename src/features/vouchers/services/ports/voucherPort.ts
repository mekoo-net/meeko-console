import type { AppResult } from '@/shared/api/httpTypes';

import type {
  ActivityClaimer,
  CreateVoucherActivityInput,
  CreateVoucherTemplateInput,
  IssueVouchersInput,
  IssueVouchersResult,
  UpdateVoucherActivityInput,
  UpdateVoucherTemplateInput,
  UserVoucher,
  VoucherActivity,
  VoucherRedemption,
  VoucherTemplate,
} from '../../model/voucher.types';

export interface VoucherPort {
  listTemplates(includeArchived?: boolean): Promise<AppResult<VoucherTemplate[]>>;
  getTemplate(id: string): Promise<AppResult<VoucherTemplate>>;
  createTemplate(input: CreateVoucherTemplateInput): Promise<AppResult<VoucherTemplate>>;
  updateTemplate(id: string, input: UpdateVoucherTemplateInput): Promise<AppResult<VoucherTemplate>>;
  setTemplateStatus(id: string, status: number): Promise<AppResult<VoucherTemplate>>;
  issue(id: string, input: IssueVouchersInput): Promise<AppResult<IssueVouchersResult>>;
  revoke(userVoucherId: string): Promise<AppResult<boolean>>;
  listUserVouchers(accountUid: string, take?: number): Promise<AppResult<UserVoucher[]>>;
  listRedemptions(accountUid: string, take?: number): Promise<AppResult<VoucherRedemption[]>>;

  listActivities(templateId?: string | null, includeEnded?: boolean): Promise<AppResult<VoucherActivity[]>>;
  createActivity(input: CreateVoucherActivityInput): Promise<AppResult<VoucherActivity>>;
  updateActivity(id: string, input: UpdateVoucherActivityInput): Promise<AppResult<VoucherActivity>>;
  setActivityStatus(id: string, status: number): Promise<AppResult<VoucherActivity>>;
  listActivityClaimers(activityId: string, take?: number): Promise<AppResult<ActivityClaimer[]>>;
}
