import type { AppResult } from '@/shared/api/httpTypes';
import { request } from '@/shared/api/httpClient';

import type {
  CreateEmailTemplatePayload,
  EmailTemplateDto,
  EmailTemplateRevisionDto,
  UpdateEmailTemplatePayload,
} from '@/features/notices/model/emailTemplate.types';
import type {
  AdminCommandResult,
  CreateSmtpPayload,
  SmtpProviderDto,
  TestSmtpPayload,
  TestSmtpProviderResult,
  UpdateSmtpPayload,
} from '@/features/notices/model/smtpProvider.types';
import type { NoticeAdminPort } from '@/features/notices/services/ports/noticeAdminPort';

const SMTP = '/api/admin/notice/channels/smtp';
const TPL = '/api/admin/notice/templates/email';

export class NoticeAdminHttpAdapter implements NoticeAdminPort {
  async listEmailTemplates(): Promise<AppResult<EmailTemplateDto[]>> {
    return request<EmailTemplateDto[]>(TPL);
  }

  async getEmailTemplate(code: string, locale: string): Promise<AppResult<EmailTemplateDto | null>> {
    return request<EmailTemplateDto | null>(`${TPL}/${code}/${locale}`);
  }

  async listEmailRevisions(uid: string): Promise<AppResult<EmailTemplateRevisionDto[]>> {
    return request<EmailTemplateRevisionDto[]>(`${TPL}/${uid}/revisions`);
  }

  async createEmailTemplate(payload: CreateEmailTemplatePayload): Promise<AppResult<AdminCommandResult>> {
    return request<AdminCommandResult>(TPL, { method: 'POST', body: payload });
  }

  async updateEmailTemplate(uid: string, payload: UpdateEmailTemplatePayload): Promise<AppResult<AdminCommandResult>> {
    return request<AdminCommandResult>(`${TPL}/${uid}`, { method: 'PUT', body: payload });
  }

  async listSmtpProviders(): Promise<AppResult<SmtpProviderDto[]>> {
    return request<SmtpProviderDto[]>(SMTP);
  }

  async getSmtpProvider(uid: string): Promise<AppResult<SmtpProviderDto | null>> {
    return request<SmtpProviderDto | null>(`${SMTP}/${uid}`);
  }

  async createSmtpProvider(payload: CreateSmtpPayload): Promise<AppResult<AdminCommandResult>> {
    return request<AdminCommandResult>(SMTP, { method: 'POST', body: payload });
  }

  async updateSmtpProvider(uid: string, payload: UpdateSmtpPayload): Promise<AppResult<AdminCommandResult>> {
    return request<AdminCommandResult>(`${SMTP}/${uid}`, { method: 'PUT', body: payload });
  }

  async deleteSmtpProvider(uid: string): Promise<AppResult<AdminCommandResult>> {
    return request<AdminCommandResult>(`${SMTP}/${uid}`, { method: 'DELETE' });
  }

  async testSmtpProvider(uid: string, payload: TestSmtpPayload): Promise<AppResult<TestSmtpProviderResult>> {
    return request<TestSmtpProviderResult>(`${SMTP}/${uid}/test`, { method: 'POST', body: payload });
  }
}
