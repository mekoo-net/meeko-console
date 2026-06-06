import type { AppResult } from '@/shared/api/httpTypes';

import type {
  BillingProduct,
  RegisterProductInput,
  UpdateProductInput,
} from '../../model/product.types';

export interface ProductPort {
  list(includeInactive?: boolean): Promise<AppResult<BillingProduct[]>>;
  get(code: string): Promise<AppResult<BillingProduct>>;
  register(input: RegisterProductInput): Promise<AppResult<BillingProduct>>;
  update(code: string, input: UpdateProductInput): Promise<AppResult<BillingProduct>>;
  setActive(code: string, active: boolean): Promise<AppResult<BillingProduct>>;
}
