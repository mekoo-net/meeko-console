import { z } from 'zod';

const idString = z.union([z.string(), z.number()]).transform((v) => String(v));

export const emailTemplateDtoSchema = z.object({
  id: idString,
  code: z.string(),
  locale: z.string(),
  subject: z.string(),
  body: z.string(),
  isHtml: z.boolean(),
  description: z.string().nullable().optional(),
  currentVersion: z.number().int(),
  isActive: z.boolean(),
  /** 绑定的 SMTP 渠道 id，undefined 表示使用默认渠道 */
  smtpProviderId: idString.nullable().optional(),
  createdAtUtc: z.string(),
  updatedAtUtc: z.string(),
});

export type EmailTemplateDto = z.infer<typeof emailTemplateDtoSchema>;

export const emailTemplateRevisionDtoSchema = z.object({
  version: z.number().int(),
  subject: z.string(),
  body: z.string(),
  isHtml: z.boolean(),
  changedBy: z.string().nullable().optional(),
  changedAtUtc: z.string(),
  changeNote: z.string().nullable().optional(),
});

export type EmailTemplateRevisionDto = z.infer<typeof emailTemplateRevisionDtoSchema>;

export interface CreateEmailTemplatePayload {
  code: string;
  locale: string;
  subject: string;
  body: string;
  isHtml: boolean;
  description?: string | undefined;
  isActive: boolean;
  /** 指定使用的 SMTP 渠道，不填则使用默认渠道 */
  smtpProviderId?: string | undefined;
}

export interface UpdateEmailTemplatePayload {
  subject: string;
  body: string;
  isHtml: boolean;
  description?: string | undefined;
  isActive: boolean;
  changeNote?: string | undefined;
  /** 指定使用的 SMTP 渠道，不填则使用默认渠道 */
  smtpProviderId?: string | undefined;
}
