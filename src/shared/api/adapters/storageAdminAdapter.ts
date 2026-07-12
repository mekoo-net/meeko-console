import type { AppResult } from '@/shared/api/httpTypes';
import { request } from '@/shared/api/httpClient';

import type {
  AdminCommandResult,
  CreateStorageBackendPayload,
  StorageBackendDto,
  TestStorageBackendResult,
  UpdateStorageBackendPayload,
} from '@/features/storage/model/storageBackend.types';
import type { StorageOverview } from '@/features/storage/model/storageOverview.types';
import type { StorageAdminPort } from '@/features/storage/services/ports/storageAdminPort';

const BASE = '/api/admin/storage/backends';

export class StorageAdminHttpAdapter implements StorageAdminPort {
  async listBackends(): Promise<AppResult<StorageBackendDto[]>> {
    return request<StorageBackendDto[]>(BASE);
  }

  async getOverview(): Promise<AppResult<StorageOverview>> {
    return request<StorageOverview>('/api/admin/storage/overview');
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
