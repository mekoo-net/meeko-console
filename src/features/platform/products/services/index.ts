import { isMockMode } from '@/shared/runtime';

import { ProductHttpAdapter } from '@/shared/api/adapters/productAdminAdapter';
import { ProductMock } from './mock/productMock';
import type { ProductPort } from './ports/productPort';

abstract class ProductServices {
  abstract readonly products: ProductPort;
}

class ProductMockServices extends ProductServices {
  readonly products = new ProductMock();
}

class ProductHttpServices extends ProductServices {
  readonly products = new ProductHttpAdapter();
}

const services: ProductServices = isMockMode ? new ProductMockServices() : new ProductHttpServices();

export function getProductPort(): ProductPort {
  return services.products;
}
