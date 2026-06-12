import { isMockMode } from '@/shared/runtime';

import { VoucherHttpAdapter } from '@/shared/api/adapters/voucherAdminAdapter';
import { VoucherMock } from './mock/voucherMock';
import type { VoucherPort } from './ports/voucherPort';

abstract class VoucherServices {
  abstract readonly vouchers: VoucherPort;
}

class VoucherMockServices extends VoucherServices {
  readonly vouchers = new VoucherMock();
}

class VoucherHttpServices extends VoucherServices {
  readonly vouchers = new VoucherHttpAdapter();
}

const services: VoucherServices = isMockMode ? new VoucherMockServices() : new VoucherHttpServices();

export function getVoucherPort(): VoucherPort {
  return services.vouchers;
}
