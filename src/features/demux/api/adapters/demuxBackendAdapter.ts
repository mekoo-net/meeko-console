import {
  issuedBackendCredentialsSchema,
  type IssueBackendInput,
  type IssuedBackendCredentials,
} from '@/features/demux/model/backend.types';
import type { DemuxBackendPort } from '@/features/demux/services/ports/demuxBackendPort';
import { requestDemux } from '@/features/demux/api/http';
import { demuxPlatformPaths } from '@/features/demux/api/routes';
import { fail, ok, type AppResult } from '@/shared/api/httpTypes';

const ISSUE_PATH = demuxPlatformPaths.adminBackends;

function parseIssued(value: unknown): AppResult<IssuedBackendCredentials> {
  const r = issuedBackendCredentialsSchema.safeParse(value);
  return r.success
    ? ok(r.data)
    : fail({ code: 'validation', message: '签发响应格式错误' });
}

export class DemuxBackendHttpAdapter implements DemuxBackendPort {
  async issue(input: IssueBackendInput): Promise<AppResult<IssuedBackendCredentials>> {
    const res = await requestDemux<unknown>(ISSUE_PATH, {
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
