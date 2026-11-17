import { JastalkAdminHttpAdapter } from '@/features/jastalk/api/adapters/jastalkAdminAdapter';
import { JastalkBackendHttpAdapter } from '@/features/jastalk/api/adapters/jastalkBackendAdapter';
import { isMockMode } from '@/shared/runtime';

import { JastalkAdminMock } from './mock/jastalkAdminMock';
import { JastalkBackendMock } from './mock/jastalkBackendMock';
import type { JastalkAdminPort } from './ports/jastalkAdminPort';
import type { JastalkBackendPort } from './ports/jastalkBackendPort';

const admin: JastalkAdminPort = isMockMode ? new JastalkAdminMock() : new JastalkAdminHttpAdapter();
const backend: JastalkBackendPort = isMockMode ? new JastalkBackendMock() : new JastalkBackendHttpAdapter();

export function getJastalkAdminPort(): JastalkAdminPort {
  return admin;
}

export function getJastalkBackendPort(): JastalkBackendPort {
  return backend;
}
