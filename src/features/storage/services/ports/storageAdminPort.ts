import type { AppResult } from '@/shared/api/httpTypes';

import type {
  AdminCommandResult,
  CreateStorageBackendPayload,
  StorageBackendDto,
  TestStorageBackendResult,
  UpdateStorageBackendPayload,
} from '../../model/storageBackend.types';

export interface StorageAdminPort {
  listBackends(): Promise<AppResult<StorageBackendDto[]>>;
  getBackend(id: string): Promise<AppResult<StorageBackendDto | null>>;
  createBackend(payload: CreateStorageBackendPayload): Promise<AppResult<AdminCommandResult>>;
  updateBackend(id: string, payload: UpdateStorageBackendPayload): Promise<AppResult<AdminCommandResult>>;
  deleteBackend(id: string): Promise<AppResult<AdminCommandResult>>;
  testBackend(id: string): Promise<AppResult<TestStorageBackendResult>>;
}
