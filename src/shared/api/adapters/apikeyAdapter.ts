import {
  mapPlatformApiKey,
  type PlatformApiKey,
} from '@/features/platform/apikeys/model/apikey.types';
import type {
  ApiKeyPort,
  IssueApiKeyInput,
  IssuedApiKey,
  ListApiKeyPage,
} from '@/features/platform/apikeys/services/ports/apikeyPort';
import { fail, ok, type AppResult } from '@/shared/api/httpTypes';
import { request } from '@/shared/api/httpClient';

export class ApiKeyHttpAdapter implements ApiKeyPort {
  async list(input: { page: number; pageSize: number }): Promise<AppResult<ListApiKeyPage>> {
    const res = await request<{ items: unknown[]; total: number }>('/api/admin/platform/apikeys', {
      query: { page: input.page, pageSize: input.pageSize },
    });
    if (!res.success) return res;
    const items = res.data.items.map((row) => mapPlatformApiKey(row as Record<string, unknown>));
    return ok({ items, total: res.data.total });
  }

  async listScopes(): Promise<AppResult<string[]>> {
    return request<string[]>('/api/admin/platform/apikeys/scopes');
  }

  async issue(input: IssueApiKeyInput): Promise<AppResult<IssuedApiKey>> {
    const res = await request<{ key: Record<string, unknown>; plaintext: string }>(
      '/api/admin/platform/apikeys',
      {
        method: 'POST',
        body: {
          name: input.name,
          scopes: input.scopes,
          expiresAtUtc: input.expiresAtUtc ?? null,
        },
      },
    );
    if (!res.success) return res;
    return ok({
      key: mapPlatformApiKey(res.data.key),
      plaintext: res.data.plaintext,
    });
  }

  async revoke(id: string): Promise<AppResult<void>> {
    const res = await request<void>(`/api/admin/platform/apikeys/${id}`, { method: 'DELETE' });
    if (!res.success) return fail(res.error);
    return ok(undefined);
  }
}

export type { PlatformApiKey };
