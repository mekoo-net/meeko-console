import {
  emailSettingsAdminSchema,
  type EmailSettingsAdmin,
  type UpdateEmailSettingsInput,
} from '../../model/settings.types';
import type { EmailSettingsPort } from '../ports/emailSettingsPort';
import { fail, ok, type AppResult } from '@/shared/api/httpTypes';
import { delay } from '@/shared/lib/delay';

let state: EmailSettingsAdmin = {
  emailSuffixRestrictionEnabled: false,
  allowedEmailSuffixes: [],
  verificationCodeEnabled: false,
  updatedAtUtc: Date.now(),
};

function parseSettings(v: unknown): AppResult<EmailSettingsAdmin> {
  const r = emailSettingsAdminSchema.safeParse(v);
  return r.success ? ok(r.data) : fail({ code: 'validation', message: '邮箱策略格式错误' });
}

function touch(): void {
  state = { ...state, updatedAtUtc: Date.now() };
}

export class EmailSettingsMock implements EmailSettingsPort {
  async get(): Promise<AppResult<EmailSettingsAdmin>> {
    await delay();
    return ok({ ...state });
  }

  async update(input: UpdateEmailSettingsInput): Promise<AppResult<EmailSettingsAdmin>> {
    await delay();
    if (input.emailSuffixRestrictionEnabled !== undefined) {
      state.emailSuffixRestrictionEnabled = input.emailSuffixRestrictionEnabled;
    }
    if (input.allowedEmailSuffixes !== undefined) {
      state.allowedEmailSuffixes = [...input.allowedEmailSuffixes];
    }
    if (input.verificationCodeEnabled !== undefined) {
      state.verificationCodeEnabled = input.verificationCodeEnabled;
    }
    touch();
    return ok({ ...state });
  }
}

export function parseEmailSettings(v: unknown): AppResult<EmailSettingsAdmin> {
  return parseSettings(v);
}
