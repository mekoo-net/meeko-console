import { StaffHttpAdapter } from '@/shared/api/adapters/staffAdapter';
import { isMockMode } from '@/shared/runtime';

import { StaffMock } from './mock/staffMock';
import type { StaffPort } from './ports/staffPort';

abstract class StaffServices {
  abstract readonly staff: StaffPort;
}

class StaffMockServices extends StaffServices {
  readonly staff = new StaffMock();
}

class StaffHttpServices extends StaffServices {
  readonly staff = new StaffHttpAdapter();
}

const services: StaffServices = isMockMode ? new StaffMockServices() : new StaffHttpServices();

export function getStaffPort(): StaffPort {
  return services.staff;
}
