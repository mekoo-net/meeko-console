import {
  issuedBackendCredentialsSchema,
  type IssueBackendInput,
  type IssuedBackendCredentials,
} from '@/features/yomi/model/backend.types';
import type { YomiBackendPort } from '@/features/yomi/services/ports/yomiBackendPort';
import { requestYomi } from '@/features/yomi/api/http';
import { yomiPlatformPaths } from '@/features/yomi/api/routes';
import { fail, ok, type AppResult } from '@/shared/api/httpTypes';

const ISSUE_PATH = yomiPlatformPaths.adminBackends;

function parseIssued(value: unknown): AppResult<IssuedBackendCredentials> {
  const r = issuedBackendCredentialsSchema.safeParse(value);
  return r.success
    ? ok(r.data)
    : fail({ code: 'validation', message: '签发响应格式错误' });
}

export class YomiBackendHttpAdapter implements YomiBackendPort {
  async issue(input: IssueBackendInput): Promise<AppResult<IssuedBackendCredentials>> {
    const res = await requestYomi<unknown>(ISSUE_PATH, {
      method: 'POST',
      body: {
        name: input.name.trim(),
        scopes: input.scopes?.length ? input.scopes : undefined,
      },
    });
    if (!res.success) return res;
    return parseIssued(res.data);
  }
}
