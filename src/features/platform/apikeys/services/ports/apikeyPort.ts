import type { PermissionCatalogItem } from '@/features/platform/staff/model/staff.types';
import type { AppResult } from '@/shared/api/httpTypes';

import type { PlatformApiKey } from '../../model/apikey.types';

export interface ListApiKeyPage {
  items: PlatformApiKey[];
  total: number;
}

export interface IssueApiKeyInput {
  name: string;
  scopes: string[];
  expiresAtUtc?: string | null;
}

export interface IssuedApiKey {
  key: PlatformApiKey;
  plaintext: string;
}

export interface ApiKeyPort {
  list(input: { page: number; pageSize: number }): Promise<AppResult<ListApiKeyPage>>;
  listScopes(): Promise<AppResult<PermissionCatalogItem[]>>;
  issue(input: IssueApiKeyInput): Promise<AppResult<IssuedApiKey>>;
  revoke(id: string): Promise<AppResult<void>>;
}
