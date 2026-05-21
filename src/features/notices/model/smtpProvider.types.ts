import { z } from 'zod';

const idString = z.union([z.string(), z.number()]).transform((v) => String(v));

export const smtpProviderDtoSchema = z.object({
  id: idString,
  name: z.string(),
  host: z.string(),
  port: z.number().int(),
  username: z.string().nullable().optional(),
  useStartTls: z.boolean(),
  fromAddress: z.string(),
  fromName: z.string(),
  isActive: z.boolean(),
  isDefault: z.boolean(),
  priority: z.number().int(),
  createdAtUtc: z.string(),
  updatedAtUtc: z.string(),
});

export type SmtpProviderDto = z.infer<typeof smtpProviderDtoSchema>;

export interface CreateSmtpPayload {
  name: string;
  host: string;
  port: number;
  username?: string | undefined;
  password?: string | undefined;
  useStartTls: boolean;
  fromAddress: string;
  fromName: string;
  isActive: boolean;
  isDefault: boolean;
  priority: number;
}

export interface UpdateSmtpPayload {
  name: string;
  host: string;
  port: number;
  username?: string | undefined;
  /** 非空则更新口令；undefined 表示表单未填写（保留）。 */
  password?: string | undefined;
  useStartTls: boolean;
  fromAddress: string;
  fromName: string;
  isActive: boolean;
  isDefault: boolean;
  priority: number;
}

export interface TestSmtpPayload {
  recipient: string;
  subject?: string | undefined;
  body?: string | undefined;
}

export const testSmtpResultSchema = z.object({
  success: z.boolean(),
  providerMessageId: z.string().nullable().optional(),
  elapsedMs: z.number().int(),
  failureCode: z.string().nullable().optional(),
  failureMessage: z.string().nullable().optional(),
});

export type TestSmtpProviderResult = z.infer<typeof testSmtpResultSchema>;

export const adminCommandResultSchema = z.object({
  success: z.boolean(),
  id: idString,
  failureCode: z.string().nullable().optional(),
  failureMessage: z.string().nullable().optional(),
});

export type AdminCommandResult = z.infer<typeof adminCommandResultSchema>;
