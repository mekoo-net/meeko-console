import type { AppResult } from '@/shared/api/httpTypes';
import { request } from '@/shared/api/httpClient';

import type {
  AdminCommandResult,
  CreateStorageBackendPayload,
  StorageBackendDto,
  TestStorageBackendResult,
  UpdateStorageBackendPayload,
} from '@/features/platform/storage/model/storageBackend.types';
import type { StorageOverview } from '@/features/platform/storage/model/storageOverview.types';
import type {
  BrowseStorageObjectsParams,
  ListStorageObjectsParams,
  StorageBrowseResult,
  StorageObjectList,
  StorageObjectRefsResult,
} from '@/features/platform/storage/model/storageObject.types';
import type { StorageAdminPort } from '@/features/platform/storage/services/ports/storageAdminPort';

const BASE = '/api/admin/storage/backends';

export class StorageAdminHttpAdapter implements StorageAdminPort {
  async listBackends(): Promise<AppResult<StorageBackendDto[]>> {
    return request<StorageBackendDto[]>(BASE);
  }

  async getOverview(): Promise<AppResult<StorageOverview>> {
    return request<StorageOverview>('/api/admin/storage/overview');
  }

  async listObjects(params: ListStorageObjectsParams): Promise<AppResult<StorageObjectList>> {
    return request<StorageObjectList>('/api/admin/storage/objects', {
      query: {
        page: params.page,
        pageSize: params.pageSize,
        accountUid: params.accountUid,
        product: params.product,
        purpose: params.purpose,
        sha256: params.sha256,
        mimePrefix: params.mimePrefix,
        status: params.status,
        backendId: params.backendId,
      },
    });
  }

  async browseObjects(params: BrowseStorageObjectsParams): Promise<AppResult<StorageBrowseResult>> {
    return request<StorageBrowseResult>('/api/admin/storage/browse', {
      query: {
        prefix: params.prefix,
        page: params.page,
        pageSize: params.pageSize,
        backendId: params.backendId,
      },
    });
  }

  async getObjectRefs(storageKey: string): Promise<AppResult<StorageObjectRefsResult>> {
    return request<StorageObjectRefsResult>('/api/admin/storage/objects/refs', {
      query: { storageKey },
    });
  }

  async getBackend(id: string): Promise<AppResult<StorageBackendDto | null>> {
    return request<StorageBackendDto | null>(`${BASE}/${id}`);
  }

  async createBackend(payload: CreateStorageBackendPayload): Promise<AppResult<AdminCommandResult>> {
    return request<AdminCommandResult>(BASE, { method: 'POST', body: payload });
  }

  async updateBackend(id: string, payload: UpdateStorageBackendPayload): Promise<AppResult<AdminCommandResult>> {
    return request<AdminCommandResult>(`${BASE}/${id}`, { method: 'PUT', body: payload });
  }

  async deleteBackend(id: string): Promise<AppResult<AdminCommandResult>> {
    return request<AdminCommandResult>(`${BASE}/${id}`, { method: 'DELETE' });
  }

  async testBackend(id: string): Promise<AppResult<TestStorageBackendResult>> {
    return request<TestStorageBackendResult>(`${BASE}/${id}/test`, { method: 'POST' });
  }
}
