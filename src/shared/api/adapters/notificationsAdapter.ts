import type { AppResult } from '@/shared/api/httpTypes';
import { request } from '@/shared/api/httpClient';

import type {
  SendNotificationPayload,
  SendNotificationResponse,
  SendOtpPayload,
  SendOtpResponse,
  VerifyOtpPayload,
  VerifyOtpResponse,
} from '@/features/platform/notices/model/sendNotification.types';
import type { NotificationsPort } from '@/features/platform/notices/services/ports/notificationsPort';

export class NotificationsHttpAdapter implements NotificationsPort {
  async sendNotification(payload: SendNotificationPayload): Promise<AppResult<SendNotificationResponse>> {
    return request<SendNotificationResponse>('/api/notifications', {
      method: 'POST',
      body: payload,
    });
  }

  async sendOtp(payload: SendOtpPayload): Promise<AppResult<SendOtpResponse>> {
    return request<SendOtpResponse>('/api/notifications/otp/send', {
      method: 'POST',
      body: payload,
    });
  }

  async verifyOtp(payload: VerifyOtpPayload): Promise<AppResult<VerifyOtpResponse>> {
    return request<VerifyOtpResponse>('/api/notifications/otp/verify', {
      method: 'POST',
      body: payload,
    });
  }
}
