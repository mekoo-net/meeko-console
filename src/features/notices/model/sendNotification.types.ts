import { z } from 'zod';

import { noticeChannelSchema, otpPurposeSchema } from './noticeEnums';

export const sendNotificationPayloadSchema = z.object({
  channel: z.string(),
  purpose: z.string(),
  recipient: z.string().min(1),
  templateCode: z.string().min(1),
  locale: z.string().optional(),
  templateData: z.record(z.string(), z.string()).optional(),
  idempotencyKey: z.string().optional(),
});

export type SendNotificationPayload = z.infer<typeof sendNotificationPayloadSchema>;

export const sendNotificationResponseSchema = z.object({
  messageId: z.string(),
  status: z.string(),
});

export type SendNotificationResponse = z.infer<typeof sendNotificationResponseSchema>;

export const sendOtpPayloadSchema = z.object({
  purpose: otpPurposeSchema,
  channel: noticeChannelSchema,
  recipient: z.string().min(1),
  accountUid: z
    .union([z.string(), z.number(), z.bigint()])
    .optional()
    .transform((v) => (v === undefined ? undefined : String(v))),
  locale: z.string().optional(),
  idempotencyKey: z.string().optional(),
});

export type SendOtpPayload = z.infer<typeof sendOtpPayloadSchema>;

export const sendOtpResponseSchema = z.object({
  auditUid: z.union([z.string(), z.number()]).transform((v) => String(v)),
  expiresAtUtc: z.string(),
});

export type SendOtpResponse = z.infer<typeof sendOtpResponseSchema>;

export const verifyOtpPayloadSchema = z.object({
  purpose: otpPurposeSchema,
  channel: noticeChannelSchema,
  recipient: z.string().min(1),
  code: z.string().min(1),
});

export type VerifyOtpPayload = z.infer<typeof verifyOtpPayloadSchema>;

export const verifyOtpResponseSchema = z.object({
  status: z.string(),
  remainingAttempts: z.number().int(),
});

export type VerifyOtpResponse = z.infer<typeof verifyOtpResponseSchema>;
