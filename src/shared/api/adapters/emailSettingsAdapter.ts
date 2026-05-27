import {
  emailSettingsAdminSchema,
  type EmailSettingsAdmin,
  type UpdateEmailSettingsInput,
} from '@/features/settings/model/settings.types';
import type { EmailSettingsPort } from '@/features/settings/services/ports/emailSettingsPort';
import { request } from '@/shared/api/httpClient';
import { fail, ok, type AppResult } from '@/shared/api/httpTypes';

const BASE = '/api/admin/platform/email/setting';

function parseSettings(value: unknown): AppResult<EmailSettingsAdmin> {
  const r = emailSettingsAdminSchema.safeParse(value);
  return r.success ? ok(r.data) : fail({ code: 'validation', message: '邮箱策略格式错误' });
}

export class EmailSettingsHttpAdapter implements EmailSettingsPort {
  async get(): Promise<AppResult<EmailSettingsAdmin>> {
    const res = await request<unknown>(BASE);
    if (!res.success) return res;
    return parseSettings(res.data);
  }

  async update(input: UpdateEmailSettingsInput): Promise<AppResult<EmailSettingsAdmin>> {
    const res = await request<unknown>(BASE, { method: 'PUT', body: input });
    if (!res.success) return res;
    return parseSettings(res.data);
  }
}
