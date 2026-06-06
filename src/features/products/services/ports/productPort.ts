import type { AppResult } from '@/shared/api/httpTypes';

import type {
  BillingProduct,
  DiscoveredProduct,
  RegisterProductInput,
  UpdateProductInput,
} from '../../model/product.types';

export interface ProductPort {
  discover(): Promise<AppResult<DiscoveredProduct[]>>;
  list(includeInactive?: boolean): Promise<AppResult<BillingProduct[]>>;
  get(code: string): Promise<AppResult<BillingProduct>>;
  register(input: RegisterProductInput): Promise<AppResult<BillingProduct>>;
  update(code: string, input: UpdateProductInput): Promise<AppResult<BillingProduct>>;
  unregister(code: string): Promise<AppResult<boolean>>;
}
