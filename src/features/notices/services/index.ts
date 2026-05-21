import { isMockMode } from '@/shared/runtime';

import { NoticeAdminMock } from './mock/noticeAdminMock';
import { NotificationsMock } from './mock/notificationsMock';
import { NoticeAdminHttpAdapter } from '@/shared/api/adapters/noticeAdminAdapter';
import { NotificationsHttpAdapter } from '@/shared/api/adapters/notificationsAdapter';
import type { NoticeAdminPort } from './ports/noticeAdminPort';
import type { NotificationsPort } from './ports/notificationsPort';

abstract class NoticeServices {
  abstract readonly admin: NoticeAdminPort;
  abstract readonly notifications: NotificationsPort;
}

class NoticeMockServices extends NoticeServices {
  readonly admin = new NoticeAdminMock();
  readonly notifications = new NotificationsMock();
}

class NoticeHttpServices extends NoticeServices {
  readonly admin = new NoticeAdminHttpAdapter();
  readonly notifications = new NotificationsHttpAdapter();
}

const services: NoticeServices = isMockMode ? new NoticeMockServices() : new NoticeHttpServices();

export function getNoticeAdminPort(): NoticeAdminPort {
  return services.admin;
}

export function getNotificationsPort(): NotificationsPort {
  return services.notifications;
}
