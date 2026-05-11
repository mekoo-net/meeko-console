import { fail, ok, type AppResult } from '@/shared/api/httpTypes';
import { delay } from '@/shared/lib/delay';

import {
  sendNotificationPayloadSchema,
  sendNotificationResponseSchema,
  sendOtpPayloadSchema,
  sendOtpResponseSchema,
  verifyOtpPayloadSchema,
  verifyOtpResponseSchema,
  type SendNotificationPayload,
  type SendNotificationResponse,
  type SendOtpPayload,
  type SendOtpResponse,
  type VerifyOtpPayload,
  type VerifyOtpResponse,
} from '../../model/sendNotification.types';
import type { NotificationsPort } from '../ports/notificationsPort';

export class NotificationsMock implements NotificationsPort {
  async sendNotification(payload: SendNotificationPayload): Promise<AppResult<SendNotificationResponse>> {
    await delay();
    const v = sendNotificationPayloadSchema.safeParse(payload);
    if (!v.success) {
      return fail({ code: 'validation', message: '请求格式错误', details: v.error.flatten().fieldErrors });
    }
    const resp = {
      messageId: `${BigInt(Date.now())}`,
      status: 'Queued',
    };
    const p = sendNotificationResponseSchema.safeParse(resp);
    return p.success ? ok(p.data) : fail({ code: 'upstream', message: '响应格式错误' });
  }

  async sendOtp(payload: SendOtpPayload): Promise<AppResult<SendOtpResponse>> {
    await delay();
    const v = sendOtpPayloadSchema.safeParse(payload);
    if (!v.success) {
      return fail({ code: 'validation', message: '请求格式错误', details: v.error.flatten().fieldErrors });
    }
    /** Mock：不显式日志验证码；不向客户端泄露 OTP。 */
    const resp = {
      auditUid: `${BigInt(Date.now())}`,
      expiresAtUtc: new Date(Date.now() + 300_000).toISOString(),
    };
    const p = sendOtpResponseSchema.safeParse(resp);
    return p.success ? ok(p.data) : fail({ code: 'upstream', message: '响应格式错误' });
  }

  async verifyOtp(payload: VerifyOtpPayload): Promise<AppResult<VerifyOtpResponse>> {
    await delay();
    const v = verifyOtpPayloadSchema.safeParse(payload);
    if (!v.success) {
      return fail({ code: 'validation', message: '请求格式错误', details: v.error.flatten().fieldErrors });
    }
    const resp = {
      status: 'Ok',
      remainingAttempts: 4,
    };
    const p = verifyOtpResponseSchema.safeParse(resp);
    return p.success ? ok(p.data) : fail({ code: 'upstream', message: '响应格式错误' });
  }
}
