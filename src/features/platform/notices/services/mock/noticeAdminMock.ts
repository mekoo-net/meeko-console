import { fail, ok, type AppResult } from '@/shared/api/httpTypes';
import { delay } from '@/shared/lib/delay';
import { createUidSeq } from '@/shared/lib/id';

import {
  emailTemplateDtoSchema,
  emailTemplateRevisionDtoSchema,
} from '../../model/emailTemplate.types';
import type {
  CreateEmailTemplatePayload,
  EmailTemplateDto,
  EmailTemplateRevisionDto,
  UpdateEmailTemplatePayload,
} from '../../model/emailTemplate.types';
import {
  adminCommandResultSchema,
  smtpProviderDtoSchema,
  testSmtpResultSchema,
  type AdminCommandResult,
  type CreateSmtpPayload,
  type SmtpProviderDto,
  type TestSmtpPayload,
  type TestSmtpProviderResult,
  type UpdateSmtpPayload,
} from '../../model/smtpProvider.types';
import type { NoticeAdminPort } from '../ports/noticeAdminPort';

const genTemplateId = createUidSeq(9_000_000);
const genSmtpId = createUidSeq(9_100_000);

function parseTemplate(v: unknown): AppResult<EmailTemplateDto> {
  const r = emailTemplateDtoSchema.safeParse(v);
  return r.success
    ? ok(r.data)
    : fail({ code: 'validation', message: 'EmailTemplateDto 格式错误' });
}

function parseRevision(v: unknown): AppResult<EmailTemplateRevisionDto> {
  const r = emailTemplateRevisionDtoSchema.safeParse(v);
  return r.success
    ? ok(r.data)
    : fail({ code: 'validation', message: 'Revision 格式错误' });
}

function parseSmtp(v: unknown): AppResult<SmtpProviderDto> {
  const r = smtpProviderDtoSchema.safeParse(v);
  return r.success
    ? ok(r.data)
    : fail({ code: 'validation', message: 'SmtpProviderDto 格式错误' });
}

function parseAdminCmd(v: unknown): AppResult<AdminCommandResult> {
  const r = adminCommandResultSchema.safeParse(v);
  return r.success
    ? ok(r.data)
    : fail({ code: 'validation', message: 'AdminCommandResult 格式错误' });
}

export class NoticeAdminMock implements NoticeAdminPort {
  private readonly templates = new Map<string, EmailTemplateDto>();
  private readonly revisions = new Map<string, EmailTemplateRevisionDto[]>();
  private readonly smtpRows = new Map<string, SmtpProviderDto>();
  /** 内存口令，绝不序列化到 UI state / 日志。 */
  private readonly smtpSecrets = new Map<string, string>();

  constructor() {
    const now = '2026-05-01T10:00:00Z';
    const prevMonth = '2026-04-15T08:30:00Z';

    // ── SMTP 渠道 ────────────────────────────────────────────────────────────
    const smtpPrimaryId = genSmtpId();
    const smtpBackupId = genSmtpId();

    const smtpPrimary: SmtpProviderDto = {
      id: smtpPrimaryId,
      name: '主要邮件渠道',
      host: 'smtp.meeko.io',
      port: 587,
      username: 'noreply',
      useStartTls: true,
      fromAddress: 'noreply@meeko.io',
      fromName: 'Meeko',
      isActive: true,
      isDefault: true,
      priority: 10,
      createdAtUtc: prevMonth,
      updatedAtUtc: prevMonth,
    };

    const smtpBackup: SmtpProviderDto = {
      id: smtpBackupId,
      name: '备用邮件渠道',
      host: 'smtp-backup.meeko.io',
      port: 587,
      username: 'noreply-backup',
      useStartTls: true,
      fromAddress: 'no-reply@meeko.io',
      fromName: 'Meeko Notifications',
      isActive: true,
      isDefault: false,
      priority: 20,
      createdAtUtc: prevMonth,
      updatedAtUtc: now,
    };

    this.smtpRows.set(smtpPrimaryId, smtpPrimary);
    this.smtpRows.set(smtpBackupId, smtpBackup);
    this.smtpSecrets.set(smtpPrimaryId, '__stub__');
    this.smtpSecrets.set(smtpBackupId, '__stub__');

    // ── 邮件模板 ─────────────────────────────────────────────────────────────
    const seedTemplate = (t: EmailTemplateDto, note = 'initial') => {
      this.templates.set(`${t.code}|${t.locale}`, t);
      this.revisions.set(t.id, [
        {
          version: 1,
          subject: t.subject,
          body: t.body,
          isHtml: t.isHtml,
          changedBy: 'seed',
          changedAtUtc: t.createdAtUtc,
          changeNote: note,
        },
      ]);
    };

    seedTemplate({
      id: genTemplateId(),
      code: 'welcome',
      locale: 'zh-CN',
      subject: '欢迎加入 {{orgName}}',
      body: '<p>您好 <b>{{displayName}}</b>，欢迎加入 {{orgName}}！</p><p>如有任何问题，请随时联系我们。</p>',
      isHtml: true,
      description: '用户注册成功欢迎邮件',
      currentVersion: 1,
      isActive: true,
      smtpProviderId: smtpPrimaryId,
      createdAtUtc: prevMonth,
      updatedAtUtc: prevMonth,
    });

    seedTemplate({
      id: genTemplateId(),
      code: 'otp_login',
      locale: 'zh-CN',
      subject: '【Meeko】您的登录验证码',
      body: '<p>您的登录验证码为：<b style="font-size:24px;letter-spacing:4px">{{code}}</b></p><p>验证码 {{expireMinutes}} 分钟内有效，请勿泄露。</p>',
      isHtml: true,
      description: '登录 OTP 验证码',
      currentVersion: 2,
      isActive: true,
      smtpProviderId: smtpPrimaryId,
      createdAtUtc: prevMonth,
      updatedAtUtc: now,
    });

    seedTemplate({
      id: genTemplateId(),
      code: 'otp_reset_password',
      locale: 'zh-CN',
      subject: '【Meeko】重置密码验证码',
      body: '<p>您正在重置密码，验证码为：<b style="font-size:24px">{{code}}</b></p><p>如非本人操作，请忽略本邮件。</p>',
      isHtml: true,
      description: '重置密码 OTP',
      currentVersion: 1,
      isActive: true,
      smtpProviderId: smtpPrimaryId,
      createdAtUtc: prevMonth,
      updatedAtUtc: prevMonth,
    });

    seedTemplate({
      id: genTemplateId(),
      code: 'invoice_ready',
      locale: 'zh-CN',
      subject: '您的账单 #{{invoiceNo}} 已生成',
      body: '<p>尊敬的 {{displayName}}，您的账单已生成，金额为 ¥{{amount}}。</p><p><a href="{{invoiceUrl}}">点此查看账单</a></p>',
      isHtml: true,
      description: '账单生成通知',
      currentVersion: 1,
      isActive: true,
      smtpProviderId: smtpBackupId,
      createdAtUtc: prevMonth,
      updatedAtUtc: prevMonth,
    });

    seedTemplate({
      id: genTemplateId(),
      code: 'ticket_update',
      locale: 'zh-CN',
      subject: '您的工单 #{{ticketNo}} 有新进展',
      body: '<p>您好 {{displayName}}，您的工单 #{{ticketNo}} 状态已更新为「{{status}}」。</p><p>点击查看详情：<a href="{{ticketUrl}}">{{ticketUrl}}</a></p>',
      isHtml: true,
      description: '工单状态变更通知',
      currentVersion: 1,
      isActive: true,
      smtpProviderId: null,
      createdAtUtc: prevMonth,
      updatedAtUtc: prevMonth,
    });
  }

  async listEmailTemplates(): Promise<AppResult<EmailTemplateDto[]>> {
    await delay();
    const out: EmailTemplateDto[] = [];
    for (const t of this.templates.values()) {
      const p = parseTemplate(t);
      if (!p.success) return p;
      out.push(p.data);
    }
    out.sort((a, b) => a.code.localeCompare(b.code) || a.locale.localeCompare(b.locale));
    return ok(out);
  }

  async getEmailTemplate(code: string, locale: string): Promise<AppResult<EmailTemplateDto | null>> {
    await delay();
    const row = this.templates.get(`${code}|${locale}`);
    if (!row) return ok(null);
    return parseTemplate(row);
  }

  async listEmailRevisions(id: string): Promise<AppResult<EmailTemplateRevisionDto[]>> {
    await delay();
    const rows = this.revisions.get(id) ?? [];
    const parsed: EmailTemplateRevisionDto[] = [];
    for (const r of rows) {
      const p = parseRevision(r);
      if (!p.success) return p;
      parsed.push(p.data);
    }
    parsed.sort((a, b) => b.version - a.version);
    return ok(parsed);
  }

  async createEmailTemplate(payload: CreateEmailTemplatePayload): Promise<AppResult<AdminCommandResult>> {
    await delay();
    const key = `${payload.code}|${payload.locale}`;
    if (this.templates.has(key)) {
      return fail({ code: 'conflict', message: '模板 code/locale 已存在' });
    }
    const id = genTemplateId();
    const now = new Date().toISOString();
    const row: EmailTemplateDto = {
      id,
      code: payload.code,
      locale: payload.locale,
      subject: payload.subject,
      body: payload.body,
      isHtml: payload.isHtml,
      description: payload.description ?? null,
      currentVersion: 1,
      isActive: payload.isActive,
      smtpProviderId: payload.smtpProviderId ?? null,
      createdAtUtc: now,
      updatedAtUtc: now,
    };
    const pr = parseTemplate(row);
    if (!pr.success) return pr;
    this.templates.set(key, pr.data);
    this.revisions.set(id, [
      {
        version: 1,
        subject: row.subject,
        body: row.body,
        isHtml: row.isHtml,
        changedBy: 'admin',
        changedAtUtc: now,
        changeNote: 'create',
      },
    ]);
    return parseAdminCmd({ success: true, id });
  }

  async updateEmailTemplate(
    id: string,
    payload: UpdateEmailTemplatePayload,
  ): Promise<AppResult<AdminCommandResult>> {
    await delay();
    let hit: EmailTemplateDto | undefined;
    let hitKey: string | undefined;
    for (const [k, v] of this.templates) {
      if (v.id === id) {
        hit = v;
        hitKey = k;
        break;
      }
    }
    if (!hit || !hitKey) return fail({ code: 'not_found', message: '模板不存在' });
    const now = new Date().toISOString();
    const next: EmailTemplateDto = {
      ...hit,
      subject: payload.subject,
      body: payload.body,
      isHtml: payload.isHtml,
      description: payload.description ?? null,
      isActive: payload.isActive,
      smtpProviderId: payload.smtpProviderId !== undefined ? payload.smtpProviderId : hit.smtpProviderId,
      currentVersion: hit.currentVersion + 1,
      updatedAtUtc: now,
    };
    const pr = parseTemplate(next);
    if (!pr.success) return pr;
    this.templates.set(hitKey, pr.data);
    const list = this.revisions.get(id) ?? [];
    list.push({
      version: next.currentVersion,
      subject: next.subject,
      body: next.body,
      isHtml: next.isHtml,
      changedBy: 'admin',
      changedAtUtc: now,
      changeNote: payload.changeNote ?? null,
    });
    this.revisions.set(id, list);
    return parseAdminCmd({ success: true, id });
  }

  async listSmtpProviders(): Promise<AppResult<SmtpProviderDto[]>> {
    await delay();
    const out: SmtpProviderDto[] = [];
    for (const r of this.smtpRows.values()) {
      const p = parseSmtp(r);
      if (!p.success) return p;
      out.push(p.data);
    }
    out.sort((a, b) => a.priority - b.priority);
    return ok(out);
  }

  async getSmtpProvider(id: string): Promise<AppResult<SmtpProviderDto | null>> {
    await delay();
    const r = this.smtpRows.get(id);
    if (!r) return ok(null);
    return parseSmtp(r);
  }

  async createSmtpProvider(payload: CreateSmtpPayload): Promise<AppResult<AdminCommandResult>> {
    await delay();
    const id = genSmtpId();
    const now = new Date().toISOString();
    const row: SmtpProviderDto = {
      id,
      name: payload.name,
      host: payload.host,
      port: payload.port,
      username: payload.username ?? null,
      useStartTls: payload.useStartTls,
      fromAddress: payload.fromAddress,
      fromName: payload.fromName,
      isActive: payload.isActive,
      isDefault: payload.isDefault,
      priority: payload.priority,
      createdAtUtc: now,
      updatedAtUtc: now,
    };
    const pr = parseSmtp(row);
    if (!pr.success) return pr;
    this.smtpRows.set(id, pr.data);
    if (payload.password && payload.password.length > 0) {
      this.smtpSecrets.set(id, '[redacted]');
    }
    return parseAdminCmd({ success: true, id });
  }

  async updateSmtpProvider(
    id: string,
    payload: UpdateSmtpPayload,
  ): Promise<AppResult<AdminCommandResult>> {
    await delay();
    const cur = this.smtpRows.get(id);
    if (!cur) return fail({ code: 'not_found', message: 'SMTP 配置不存在' });
    const now = new Date().toISOString();
    const next: SmtpProviderDto = {
      ...cur,
      name: payload.name,
      host: payload.host,
      port: payload.port,
      username: payload.username ?? null,
      useStartTls: payload.useStartTls,
      fromAddress: payload.fromAddress,
      fromName: payload.fromName,
      isActive: payload.isActive,
      isDefault: payload.isDefault,
      priority: payload.priority,
      updatedAtUtc: now,
    };
    const pr = parseSmtp(next);
    if (!pr.success) return pr;
    this.smtpRows.set(id, pr.data);
    if (payload.password && payload.password.length > 0) {
      this.smtpSecrets.set(id, '[redacted]');
    }
    return parseAdminCmd({ success: true, id });
  }

  async deleteSmtpProvider(id: string): Promise<AppResult<AdminCommandResult>> {
    await delay();
    if (!this.smtpRows.has(id)) return fail({ code: 'not_found', message: 'SMTP 配置不存在' });
    this.smtpRows.delete(id);
    this.smtpSecrets.delete(id);
    return parseAdminCmd({ success: true, id });
  }

  async testSmtpProvider(id: string, _payload: TestSmtpPayload): Promise<AppResult<TestSmtpProviderResult>> {
    await delay();
    if (!this.smtpRows.has(id)) return fail({ code: 'not_found', message: 'SMTP 配置不存在' });
    const result = {
      success: true,
      providerMessageId: `mock-${Date.now()}`,
      elapsedMs: 42,
      failureCode: null,
      failureMessage: null,
    };
    const r = testSmtpResultSchema.safeParse(result);
    return r.success
      ? ok(r.data)
      : fail({ code: 'validation', message: 'TestSmtpProviderResult 格式错误' });
  }
}
