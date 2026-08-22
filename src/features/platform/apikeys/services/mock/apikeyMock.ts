import { fail, ok, type AppResult } from '@/shared/api/httpTypes';
import {
  MOCK_ALL_STAFF_PERMISSIONS,
} from '@/features/platform/staff/services/mock/mockPermissions';
import type { PermissionCatalogItem } from '@/features/platform/staff/model/staff.types';

import { mapPlatformApiKey, type PlatformApiKey } from '../../model/apikey.types';
import type { ApiKeyPort, IssueApiKeyInput, IssuedApiKey, ListApiKeyPage, UpdateApiKeyInput } from '../ports/apikeyPort';

let nextId = 1;
const keys: PlatformApiKey[] = [];

function randomPlaintext(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const MOCK_CATALOG: PermissionCatalogItem[] = MOCK_ALL_STAFF_PERMISSIONS.map((code, i) => ({
  id: String(i + 1),
  code,
  description: null,
}));

export class ApiKeyMock implements ApiKeyPort {
  async list(input: { page: number; pageSize: number }): Promise<AppResult<ListApiKeyPage>> {
    const start = (input.page - 1) * input.pageSize;
    return ok({
      items: keys.slice(start, start + input.pageSize),
      total: keys.length,
    });
  }

  async listScopes(): Promise<AppResult<PermissionCatalogItem[]>> {
    return ok(MOCK_CATALOG);
  }

  async issue(input: IssueApiKeyInput): Promise<AppResult<IssuedApiKey>> {
    const name = input.name.trim();
    if (!name) return fail({ code: 'validation', message: 'name required (1-80)' });
    if (input.scopes.length === 0) return fail({ code: 'validation', message: 'permissions required' });

    const plaintext = randomPlaintext();
    const now = Date.now();
    const key = mapPlatformApiKey({
      id: String(nextId++),
      name,
      keyHint: plaintext.slice(0, 8),
      scopes: input.scopes,
      issuedByStaffUid: '300000001',
      expiresAtUtc: input.expiresAtUtc ? Date.parse(input.expiresAtUtc) : null,
      revokedAtUtc: null,
      lastUsedAtUtc: null,
      createdAtUtc: now,
      plaintext,
    });
    keys.unshift(key);
    return ok({ key, plaintext });
  }

  async update(id: string, input: UpdateApiKeyInput): Promise<AppResult<PlatformApiKey>> {
    const row = keys.find((k) => k.id === id);
    if (!row) return fail({ code: 'not_found', message: `API key ${id} not found` });
    if (row.revokedAtUtc) return fail({ code: 'conflict', message: 'revoked key cannot change permissions' });
    if (input.scopes.length === 0) return fail({ code: 'validation', message: 'permissions required' });
    row.scopes = [...input.scopes];
    return ok(row);
  }

  async revoke(id: string): Promise<AppResult<void>> {
    const row = keys.find((k) => k.id === id);
    if (!row) return fail({ code: 'not_found', message: `API key ${id} not found` });
    if (!row.revokedAtUtc) {
      row.revokedAtUtc = Date.now();
    }
    return ok(undefined);
  }
}
