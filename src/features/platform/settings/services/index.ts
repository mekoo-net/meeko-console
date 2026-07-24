import { isMockMode } from '@/shared/runtime';

import { AuthSettingsMock } from './mock/authSettingsMock';
import { EmailSettingsMock } from './mock/emailSettingsMock';
import { ReferralSettingsMock } from './mock/referralSettingsMock';
import { AuthSettingsHttpAdapter } from '@/shared/api/adapters/authSettingsAdapter';
import { EmailSettingsHttpAdapter } from '@/shared/api/adapters/emailSettingsAdapter';
import { ReferralSettingsHttpAdapter } from '@/shared/api/adapters/referralSettingsAdapter';
import type { AuthSettingsPort } from './ports/authSettingsPort';
import type { EmailSettingsPort } from './ports/emailSettingsPort';
import type { ReferralSettingsPort } from './ports/referralSettingsPort';

abstract class PlatformSettingsServices {
  abstract readonly auth: AuthSettingsPort;
  abstract readonly email: EmailSettingsPort;
  abstract readonly referral: ReferralSettingsPort;
}

class PlatformSettingsMockServices extends PlatformSettingsServices {
  readonly auth = new AuthSettingsMock();
  readonly email = new EmailSettingsMock();
  readonly referral = new ReferralSettingsMock();
}

class PlatformSettingsHttpServices extends PlatformSettingsServices {
  readonly auth = new AuthSettingsHttpAdapter();
  readonly email = new EmailSettingsHttpAdapter();
  readonly referral = new ReferralSettingsHttpAdapter();
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

export function getReferralSettingsPort(): ReferralSettingsPort {
  return services.referral;
}
