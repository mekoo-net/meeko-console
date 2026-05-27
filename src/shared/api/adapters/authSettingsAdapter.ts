import {
  authSettingsAdminSchema,
  type AuthSettingsAdmin,
  type UpdateAuthSettingsInput,
} from '@/features/settings/model/settings.types';
import type { AuthSettingsPort } from '@/features/settings/services/ports/authSettingsPort';
import { request } from '@/shared/api/httpClient';
import { fail, ok, type AppResult } from '@/shared/api/httpTypes';

const BASE = '/api/admin/platform/auth/setting';

function parseSettings(value: unknown): AppResult<AuthSettingsAdmin> {
  const r = authSettingsAdminSchema.safeParse(value);
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
