import { NoticeAdminMock } from './mock/noticeAdminMock';
import { NotificationsMock } from './mock/notificationsMock';
import type { NoticeAdminPort } from './ports/noticeAdminPort';
import type { NotificationsPort } from './ports/notificationsPort';

let noticeCached: NoticeAdminPort | null = null;
let notificationsCached: NotificationsPort | null = null;

function shouldUseMock(): boolean {
  const raw = import.meta.env?.VITE_USE_MOCK;
  if (typeof raw === 'string') return raw.toLowerCase() !== 'false';
  return true;
}

export function getNoticeAdminPort(): NoticeAdminPort {
  if (noticeCached !== null) return noticeCached;
  if (shouldUseMock()) {
    noticeCached = new NoticeAdminMock();
    return noticeCached;
  }
  throw new Error(
    'HttpNoticeAdminAdapter 尚未实现：请接入 /api/admin/notice/templates/email 与 /api/admin/notice/channels/smtp。',
  );
}

export function getNotificationsPort(): NotificationsPort {
  if (notificationsCached !== null) return notificationsCached;
  if (shouldUseMock()) {
    notificationsCached = new NotificationsMock();
    return notificationsCached;
  }
  throw new Error('HttpNotificationsAdapter 尚未实现：请接入 /api/notifications 与 /api/notifications/otp/*。');
}
