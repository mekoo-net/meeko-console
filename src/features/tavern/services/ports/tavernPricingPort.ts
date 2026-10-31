import type { AppResult } from '@/shared/api/httpTypes';

import type { MeteringPricing, UpdateMeteringPricingInput } from '../../model/meteringPricing.types';

export interface TavernPricingPort {
  get(): Promise<AppResult<MeteringPricing>>;
  update(input: UpdateMeteringPricingInput): Promise<AppResult<MeteringPricing>>;
}
