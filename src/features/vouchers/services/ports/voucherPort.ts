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

export interface ListActivityClaimersInput {
  activityId: string;
  page: number;
  pageSize: number;
  /** 按账户 UID 精确过滤（关键字为纯数字时生效）。 */
  accountUid?: string;
  /** 券状态过滤（UserVoucherStatus）。 */
  status?: number | null;
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
  /** 完整券余额流水（发放/预占/释放/抵扣/退回/过期/作废）。 */
  listLedger(accountUid: string, take?: number): Promise<AppResult<VoucherRedemption[]>>;
  /** 审计：按券查其全部抵扣流水。 */
  listRedemptionsByVoucher(userVoucherId: string, take?: number): Promise<AppResult<VoucherRedemption[]>>;
  /** 审计：按账单(Hold)查其全部券抵扣。 */
  listRedemptionsByBill(holdId: string): Promise<AppResult<VoucherRedemption[]>>;
  /** 审计：按券查完整余额流水。 */
  listLedgerByVoucher(userVoucherId: string, take?: number): Promise<AppResult<VoucherRedemption[]>>;
  /** 审计：按账单查完整券流水。 */
  listLedgerByBill(holdId: string): Promise<AppResult<VoucherRedemption[]>>;

  listActivities(input: ListVoucherActivitiesInput): Promise<AppResult<ListPage<VoucherActivity>>>;
  createActivity(input: CreateVoucherActivityInput): Promise<AppResult<VoucherActivity>>;
  updateActivity(id: string, input: UpdateVoucherActivityInput): Promise<AppResult<VoucherActivity>>;
  setActivityStatus(id: string, status: number): Promise<AppResult<VoucherActivity>>;
  listActivityClaimers(input: ListActivityClaimersInput): Promise<AppResult<ListPage<ActivityClaimer>>>;
}
