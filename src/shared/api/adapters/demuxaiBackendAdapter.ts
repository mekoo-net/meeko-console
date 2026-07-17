import {
  issuedBackendCredentialsSchema,
  type IssueBackendInput,
  type IssuedBackendCredentials,
} from '@/features/demux/model/backend.types';
import type { DemuxaiBackendPort } from '@/features/demux/services/ports/demuxaiBackendPort';
import { requestDemux } from '@/shared/api/httpClient';
import { fail, ok, type AppResult } from '@/shared/api/httpTypes';

const ISSUE_PATH = '/demux/api/admin/backends';

function parseIssued(value: unknown): AppResult<IssuedBackendCredentials> {
  const r = issuedBackendCredentialsSchema.safeParse(value);
  return r.success
    ? ok(r.data)
    : fail({ code: 'validation', message: '签发响应格式错误' });
}

export class DemuxaiBackendHttpAdapter implements DemuxaiBackendPort {
  async issue(input: IssueBackendInput): Promise<AppResult<IssuedBackendCredentials>> {
    const res = await requestDemuxAi<unknown>(ISSUE_PATH, {
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
