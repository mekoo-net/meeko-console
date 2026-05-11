import type { AppResult } from '@/shared/api/httpTypes';

import type {
  SendNotificationPayload,
  SendNotificationResponse,
  SendOtpPayload,
  SendOtpResponse,
  VerifyOtpPayload,
  VerifyOtpResponse,
} from '../../model/sendNotification.types';

export interface NotificationsPort {
  sendNotification(payload: SendNotificationPayload): Promise<AppResult<SendNotificationResponse>>;
  sendOtp(payload: SendOtpPayload): Promise<AppResult<SendOtpResponse>>;
  verifyOtp(payload: VerifyOtpPayload): Promise<AppResult<VerifyOtpResponse>>;
}
