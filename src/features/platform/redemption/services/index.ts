import { isMockMode } from '@/shared/runtime';
import { RedemptionAdminHttpAdapter } from '@/shared/api/adapters/redemptionAdminAdapter';

import { RedemptionMock } from './mock/redemptionMock';
import type { RedemptionPort } from './ports/redemptionPort';

const port: RedemptionPort = isMockMode ? new RedemptionMock() : new RedemptionAdminHttpAdapter();

export function getRedemptionPort(): RedemptionPort {
  return port;
}
