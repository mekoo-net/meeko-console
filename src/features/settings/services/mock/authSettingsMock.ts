import {
  authSettingsAdminSchema,
  type AuthSettingsAdmin,
  type UpdateAuthSettingsInput,
} from '../../model/settings.types';
import type { AuthSettingsPort } from '../ports/authSettingsPort';
import { fail, ok, type AppResult } from '@/shared/api/httpTypes';
import { delay } from '@/shared/lib/delay';

let state: AuthSettingsAdmin = {
  registrationEnabled: true,
  passwordLogin: true,
  registrationChannel: 'email',
  captchaEnabled: false,
  captchaProvider: 'none',
  captchaSiteKey: '',
  captchaSecretConfigured: false,
  updatedAtUtc: new Date().toISOString(),
};

function parseSettings(v: unknown): AppResult<AuthSettingsAdmin> {
  const r = authSettingsAdminSchema.safeParse(v);
  return r.success ? ok(r.data) : fail({ code: 'validation', message: '注册登录策略格式错误' });
}

function touch(): void {
  state = { ...state, updatedAtUtc: new Date().toISOString() };
}

export class AuthSettingsMock implements AuthSettingsPort {
  async get(): Promise<AppResult<AuthSettingsAdmin>> {
    await delay();
    return ok({ ...state });
  }

  async update(input: UpdateAuthSettingsInput): Promise<AppResult<AuthSettingsAdmin>> {
    await delay();
    if (input.registrationEnabled !== undefined) state.registrationEnabled = input.registrationEnabled;
    if (input.passwordLogin !== undefined) state.passwordLogin = input.passwordLogin;
    if (input.registrationChannel !== undefined) state.registrationChannel = input.registrationChannel;
    if (input.captchaEnabled !== undefined) state.captchaEnabled = input.captchaEnabled;
    if (input.captchaProvider !== undefined) state.captchaProvider = input.captchaProvider;
    if (input.captchaSiteKey !== undefined) state.captchaSiteKey = input.captchaSiteKey;
    if (input.captchaSecretKey !== undefined && input.captchaSecretKey.length > 0) {
      state.captchaSecretConfigured = true;
    }
    touch();
    return ok({ ...state });
  }
}

export function parseAuthSettings(v: unknown): AppResult<AuthSettingsAdmin> {
  return parseSettings(v);
}
