import {
  authSettingsAdminSchema,
  type AuthSettingsAdmin,
  type UpdateAuthSettingsInput,
} from '@/features/settings/model/settings.types';
import type { AuthSettingsPort } from '@/features/settings/services/ports/authSettingsPort';
import { request } from '@/shared/api/httpClient';
import { fail, ok, type AppResult } from '@/shared/api/httpTypes';
import { asEpochMillis } from '@/shared/lib/epoch';

const BASE = '/api/admin/platform/auth/setting';

function mapAuthSettingsWire(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') return raw;
  const w = raw as Record<string, unknown>;
  const providerRaw = w.captchaProvider ?? w.captcha_provider;
  const provider =
    typeof providerRaw === 'string' && providerRaw.trim().length > 0 ? providerRaw.trim() : 'none';

  return {
    registrationEnabled: w.registrationEnabled ?? w.registration_enabled ?? true,
    passwordLogin: w.passwordLogin ?? w.password_login ?? true,
    registrationChannel: w.registrationChannel ?? w.registration_channel ?? 'email',
    captchaEnabled: w.captchaEnabled ?? w.captcha_enabled ?? false,
    captchaProvider: provider,
    captchaSiteKey: w.captchaSiteKey ?? w.captcha_site_key ?? '',
    captchaSecretConfigured: w.captchaSecretConfigured ?? w.captcha_secret_configured ?? false,
    updatedAtUtc: asEpochMillis(w.updatedAtUtc ?? w.updated_at_utc) ?? Date.now(),
  };
}

function parseSettings(value: unknown): AppResult<AuthSettingsAdmin> {
  const r = authSettingsAdminSchema.safeParse(mapAuthSettingsWire(value));
  return r.success ? ok(r.data) : fail({ code: 'validation', message: '注册登录策略格式错误' });
}

export class AuthSettingsHttpAdapter implements AuthSettingsPort {
  async get(): Promise<AppResult<AuthSettingsAdmin>> {
    const res = await request<unknown>(BASE);
    if (!res.success) return res;
    return parseSettings(res.data);
  }

  async update(input: UpdateAuthSettingsInput): Promise<AppResult<AuthSettingsAdmin>> {
    const res = await request<unknown>(BASE, { method: 'PUT', body: input });
    if (!res.success) return res;
    return parseSettings(res.data);
  }
}
