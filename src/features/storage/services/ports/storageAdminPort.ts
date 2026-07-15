import type { AppResult } from '@/shared/api/httpTypes';

import type {
  AdminCommandResult,
  CreateStorageBackendPayload,
  StorageBackendDto,
  TestStorageBackendResult,
  UpdateStorageBackendPayload,
} from '../../model/storageBackend.types';
import type { StorageOverview } from '../../model/storageOverview.types';
import type {
  BrowseStorageObjectsParams,
  ListStorageObjectsParams,
  StorageBrowseResult,
  StorageObjectList,
  StorageObjectRefsResult,
} from '../../model/storageObject.types';

export interface StorageAdminPort {
  listBackends(): Promise<AppResult<StorageBackendDto[]>>;
  getBackend(id: string): Promise<AppResult<StorageBackendDto | null>>;
  getOverview(): Promise<AppResult<StorageOverview>>;
  listObjects(params: ListStorageObjectsParams): Promise<AppResult<StorageObjectList>>;
  browseObjects(params: BrowseStorageObjectsParams): Promise<AppResult<StorageBrowseResult>>;
  getObjectRefs(storageKey: string): Promise<AppResult<StorageObjectRefsResult>>;
  createBackend(payload: CreateStorageBackendPayload): Promise<AppResult<AdminCommandResult>>;
  updateBackend(id: string, payload: UpdateStorageBackendPayload): Promise<AppResult<AdminCommandResult>>;
  deleteBackend(id: string): Promise<AppResult<AdminCommandResult>>;
  testBackend(id: string): Promise<AppResult<TestStorageBackendResult>>;
}
