import {
  issuedBackendCredentialsSchema,
  type IssueTavernBackendInput,
  type IssuedBackendCredentials,
} from '@/features/tavern/model/backend.types';
import type { TavernBackendPort } from '@/features/tavern/services/ports/tavernBackendPort';
import { requestTavern } from '@/features/tavern/api/http';
import { fail, ok, type AppResult } from '@/shared/api/httpTypes';

const ISSUE_PATH = '/tavern/api/admin/backends';

function parseIssued(value: unknown): AppResult<IssuedBackendCredentials> {
  const r = issuedBackendCredentialsSchema.safeParse(value);
  return r.success
    ? ok(r.data)
    : fail({ code: 'validation', message: '签发响应格式错误' });
}

export class TavernBackendHttpAdapter implements TavernBackendPort {
  async issue(input: IssueTavernBackendInput): Promise<AppResult<IssuedBackendCredentials>> {
    const name = input.name?.trim();
    const res = await requestTavern<unknown>(ISSUE_PATH, {
      method: 'POST',
      body: name ? { name } : {},
    });
    if (!res.success) return res;
    return parseIssued(res.data);
  }
}
