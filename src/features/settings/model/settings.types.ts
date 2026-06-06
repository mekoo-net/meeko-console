import { z } from 'zod';

import { epochMillisSchema } from '@/shared/lib/epoch';

export const registrationChannelSchema = z.enum(['email', 'phone', 'both']);
export type RegistrationChannel = z.infer<typeof registrationChannelSchema>;

export const captchaProviderSchema = z.enum([
  'none',
  'turnstile',
  'recaptcha_v2',
  'recaptcha_v3',
  'hcaptcha',
]);
export type CaptchaProvider = z.infer<typeof captchaProviderSchema>;

/** Staff 后台：注册/登录策略（GET/PUT /api/admin/platform/auth/setting）。 */
export const authSettingsAdminSchema = z.object({
  registrationEnabled: z.boolean(),
  passwordLogin: z.boolean(),
  registrationChannel: registrationChannelSchema,
  captchaEnabled: z.boolean(),
  captchaProvider: captchaProviderSchema,
  captchaSiteKey: z.string(),
  captchaSecretConfigured: z.boolean(),
  updatedAtUtc: epochMillisSchema,
});

export type AuthSettingsAdmin = z.infer<typeof authSettingsAdminSchema>;

export const updateAuthSettingsSchema = z.object({
  registrationEnabled: z.boolean().optional(),
  passwordLogin: z.boolean().optional(),
  registrationChannel: registrationChannelSchema.optional(),
  captchaEnabled: z.boolean().optional(),
  captchaProvider: captchaProviderSchema.optional(),
  captchaSiteKey: z.string().optional(),
  /** 留空表示不修改已保存的 Secret。 */
  captchaSecretKey: z.string().optional(),
});

export type UpdateAuthSettingsInput = z.infer<typeof updateAuthSettingsSchema>;

/** Staff 后台：邮箱策略（GET/PUT /api/admin/platform/email/setting）。 */
export const emailSettingsAdminSchema = z.object({
  emailSuffixRestrictionEnabled: z.boolean(),
  allowedEmailSuffixes: z.array(z.string()),
  verificationCodeEnabled: z.boolean(),
  updatedAtUtc: epochMillisSchema,
});

export type EmailSettingsAdmin = z.infer<typeof emailSettingsAdminSchema>;

export const updateEmailSettingsSchema = z.object({
  emailSuffixRestrictionEnabled: z.boolean().optional(),
  allowedEmailSuffixes: z.array(z.string()).optional(),
  verificationCodeEnabled: z.boolean().optional(),
});

export type UpdateEmailSettingsInput = z.infer<typeof updateEmailSettingsSchema>;

/** 单个注册产品 / 渠道的返利率配置。 */
export const referralProductRateSchema = z.object({
  /** 产品 / 渠道唯一标识（如 demuxai）。 */
  productCode: z.string().min(1),
  /** 展示名（如 DemuxAI）。 */
  productName: z.string().min(1),
  /** 是否对该产品启用返利。 */
  enabled: z.boolean(),
  /** 该产品的返利率（%）。 */
  rebateRatePercent: z.number().min(0).max(100),
});

export type ReferralProductRate = z.infer<typeof referralProductRateSchema>;

export const referralSettingsAdminSchema = z.object({
  enabled: z.boolean(),
  defaultRebateRatePercent: z.number().min(0).max(100),
  minWithdrawAmount: z.number().nonnegative(),
  withdrawReviewRequired: z.boolean(),
  /** 按注册产品 / 渠道细分的返利率；未列出的产品使用默认返利率。 */
  productRates: z.array(referralProductRateSchema).default([]),
  updatedAtUtc: epochMillisSchema,
});

export type ReferralSettingsAdmin = z.infer<typeof referralSettingsAdminSchema>;

export const updateReferralSettingsSchema = z.object({
  enabled: z.boolean().optional(),
  defaultRebateRatePercent: z.number().min(0).max(100).optional(),
  minWithdrawAmount: z.number().nonnegative().optional(),
  withdrawReviewRequired: z.boolean().optional(),
  productRates: z.array(referralProductRateSchema).optional(),
});

export type UpdateReferralSettingsInput = z.infer<typeof updateReferralSettingsSchema>;
