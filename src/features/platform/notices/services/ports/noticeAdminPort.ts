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
  listEmailRevisions(id: string): Promise<AppResult<EmailTemplateRevisionDto[]>>;
  createEmailTemplate(payload: CreateEmailTemplatePayload): Promise<AppResult<AdminCommandResult>>;
  updateEmailTemplate(id: string, payload: UpdateEmailTemplatePayload): Promise<AppResult<AdminCommandResult>>;
  listSmtpProviders(): Promise<AppResult<SmtpProviderDto[]>>;
  getSmtpProvider(id: string): Promise<AppResult<SmtpProviderDto | null>>;
  createSmtpProvider(payload: CreateSmtpPayload): Promise<AppResult<AdminCommandResult>>;
  updateSmtpProvider(id: string, payload: UpdateSmtpPayload): Promise<AppResult<AdminCommandResult>>;
  deleteSmtpProvider(id: string): Promise<AppResult<AdminCommandResult>>;
  testSmtpProvider(id: string, payload: TestSmtpPayload): Promise<AppResult<TestSmtpProviderResult>>;
}
