import type { ListPage } from '@/shared/composables/useListQuery';
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

export interface ListVoucherTemplatesInput {
  page: number;
  pageSize: number;
  includeArchived?: boolean;
}

export interface ListVoucherActivitiesInput {
  page: number;
  pageSize: number;
  templateId?: string | null;
  includeEnded?: boolean;
}

export interface ListUserVouchersInput {
  page: number;
  pageSize: number;
  accountUid: string;
}

export interface VoucherPort {
  listTemplates(input: ListVoucherTemplatesInput): Promise<AppResult<ListPage<VoucherTemplate>>>;
  getTemplate(id: string): Promise<AppResult<VoucherTemplate>>;
  createTemplate(input: CreateVoucherTemplateInput): Promise<AppResult<VoucherTemplate>>;
  updateTemplate(id: string, input: UpdateVoucherTemplateInput): Promise<AppResult<VoucherTemplate>>;
  setTemplateStatus(id: string, status: number): Promise<AppResult<VoucherTemplate>>;
  issue(id: string, input: IssueVouchersInput): Promise<AppResult<IssueVouchersResult>>;
  revoke(userVoucherId: string): Promise<AppResult<boolean>>;
  listUserVouchers(input: ListUserVouchersInput): Promise<AppResult<ListPage<UserVoucher>>>;
  listRedemptions(accountUid: string, take?: number): Promise<AppResult<VoucherRedemption[]>>;

  listActivities(input: ListVoucherActivitiesInput): Promise<AppResult<ListPage<VoucherActivity>>>;
  createActivity(input: CreateVoucherActivityInput): Promise<AppResult<VoucherActivity>>;
  updateActivity(id: string, input: UpdateVoucherActivityInput): Promise<AppResult<VoucherActivity>>;
  setActivityStatus(id: string, status: number): Promise<AppResult<VoucherActivity>>;
  listActivityClaimers(activityId: string, take?: number): Promise<AppResult<ActivityClaimer[]>>;
}
