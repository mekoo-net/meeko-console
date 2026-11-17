import { requestJastalk } from '@/features/jastalk/api/http';
import { jastalkPaths } from '@/features/jastalk/api/routes';
import type { JastalkBackendPort } from '@/features/jastalk/services/ports/jastalkBackendPort';
import {
  issuedBackendCredentialsSchema,
  type IssuedBackendCredentials,
} from '@/features/platform/gateway/model/backend.types';
import { fail, ok, type AppResult } from '@/shared/api/httpTypes';

export class JastalkBackendHttpAdapter implements JastalkBackendPort {
  async issue(): Promise<AppResult<IssuedBackendCredentials>> {
    const res = await requestJastalk<unknown>(jastalkPaths.backends, { method: 'POST', body: {} });
    if (!res.success) return res;
    const parsed = issuedBackendCredentialsSchema.safeParse(res.data);
    return parsed.success ? ok(parsed.data) : fail({ code: 'validation', message: '签发响应格式错误' });
  }
}
