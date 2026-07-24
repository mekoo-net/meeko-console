import { isMockMode } from '@/shared/runtime';

import { StorageAdminHttpAdapter } from '@/shared/api/adapters/storageAdminAdapter';
import { StorageAdminMock } from './mock/storageAdminMock';
import type { StorageAdminPort } from './ports/storageAdminPort';

abstract class StorageServices {
  abstract readonly admin: StorageAdminPort;
}

class StorageMockServices extends StorageServices {
  readonly admin = new StorageAdminMock();
}

class StorageHttpServices extends StorageServices {
  readonly admin = new StorageAdminHttpAdapter();
}

const services: StorageServices = isMockMode ? new StorageMockServices() : new StorageHttpServices();

export function getStorageAdminPort(): StorageAdminPort {
  return services.admin;
}
