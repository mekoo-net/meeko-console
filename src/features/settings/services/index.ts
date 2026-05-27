import { isMockMode } from '@/shared/runtime';

import { AuthSettingsMock } from './mock/authSettingsMock';
import { EmailSettingsMock } from './mock/emailSettingsMock';
import { AuthSettingsHttpAdapter } from '@/shared/api/adapters/authSettingsAdapter';
import { EmailSettingsHttpAdapter } from '@/shared/api/adapters/emailSettingsAdapter';
import type { AuthSettingsPort } from './ports/authSettingsPort';
import type { EmailSettingsPort } from './ports/emailSettingsPort';

abstract class PlatformSettingsServices {
  abstract readonly auth: AuthSettingsPort;
  abstract readonly email: EmailSettingsPort;
}

class PlatformSettingsMockServices extends PlatformSettingsServices {
  readonly auth = new AuthSettingsMock();
  readonly email = new EmailSettingsMock();
}

class PlatformSettingsHttpServices extends PlatformSettingsServices {
  readonly auth = new AuthSettingsHttpAdapter();
  readonly email = new EmailSettingsHttpAdapter();
}

const services: PlatformSettingsServices = isMockMode
  ? new PlatformSettingsMockServices()
  : new PlatformSettingsHttpServices();

export function getAuthSettingsPort(): AuthSettingsPort {
  return services.auth;
}

export function getEmailSettingsPort(): EmailSettingsPort {
  return services.email;
}
