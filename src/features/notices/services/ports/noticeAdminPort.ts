import type { AppResult } from '@/shared/api/httpTypes';

import type {
  CreateEmailTemplatePayload,
  EmailTemplateDto,
  EmailTemplateRevisionDto,
  UpdateEmailTemplatePayload,
} from '../../model/emailTemplate.types';
import type {
  AdminCommandResult,
  CreateSmtpPayload,
  SmtpProviderDto,
  TestSmtpPayload,
  TestSmtpProviderResult,
  UpdateSmtpPayload,
} from '../../model/smtpProvider.types';

export interface NoticeAdminPort {
  listEmailTemplates(): Promise<AppResult<EmailTemplateDto[]>>;
  getEmailTemplate(code: string, locale: string): Promise<AppResult<EmailTemplateDto | null>>;
  listEmailRevisions(uid: string): Promise<AppResult<EmailTemplateRevisionDto[]>>;
  createEmailTemplate(payload: CreateEmailTemplatePayload): Promise<AppResult<AdminCommandResult>>;
  updateEmailTemplate(uid: string, payload: UpdateEmailTemplatePayload): Promise<AppResult<AdminCommandResult>>;
  listSmtpProviders(): Promise<AppResult<SmtpProviderDto[]>>;
  getSmtpProvider(uid: string): Promise<AppResult<SmtpProviderDto | null>>;
  createSmtpProvider(payload: CreateSmtpPayload): Promise<AppResult<AdminCommandResult>>;
  updateSmtpProvider(uid: string, payload: UpdateSmtpPayload): Promise<AppResult<AdminCommandResult>>;
  deleteSmtpProvider(uid: string): Promise<AppResult<AdminCommandResult>>;
  testSmtpProvider(uid: string, payload: TestSmtpPayload): Promise<AppResult<TestSmtpProviderResult>>;
}
