import { z } from 'zod';

/** Meeko.Contracts.Notice — JSON 枚举值为数值 */

export const noticeChannelSchema = z.union([z.literal(1), z.literal(2)]);
export type NoticeChannel = z.infer<typeof noticeChannelSchema>;

export const NoticeChannelLabel: Readonly<Record<NoticeChannel, string>> = {
  1: '邮件',
  2: '短信',
};

export const noticePurposeSchema = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(99)]);
export type NoticePurpose = z.infer<typeof noticePurposeSchema>;

export const NoticePurposeLabel: Readonly<Record<NoticePurpose, string>> = {
  1: 'OTP',
  2: '活动',
  3: '工单',
  99: '通用',
};

export const otpPurposeSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
  z.literal(6),
]);
export type OtpPurpose = z.infer<typeof otpPurposeSchema>;

export const OtpPurposeLabel: Readonly<Record<OtpPurpose, string>> = {
  1: '登录',
  2: '注册',
  3: '重置密码',
  4: '更换邮箱',
  5: '风控核验',
  6: '绑定 MFA',
};
