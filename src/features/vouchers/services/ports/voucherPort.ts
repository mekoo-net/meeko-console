import type { AppResult } from '@/shared/api/httpTypes';

import type {
  CreateVoucherTemplateInput,
  IssueVouchersInput,
  IssueVouchersResult,
  UpdateVoucherTemplateInput,
  UserVoucher,
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
}
