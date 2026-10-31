import { parseTavern, requestTavern } from '@/features/tavern/api/http';
import type { TavernPricingPort } from '@/features/tavern/services/ports/tavernPricingPort';
import type { AppResult } from '@/shared/api/httpTypes';

import {
  meteringPricingSchema,
  type MeteringPricing,
  type UpdateMeteringPricingInput,
} from '../../model/meteringPricing.types';

const BASE = '/tavern/api/admin/settings/metering';

export class TavernPricingHttpAdapter implements TavernPricingPort {
  async get(): Promise<AppResult<MeteringPricing>> {
    return parseTavern(meteringPricingSchema, await requestTavern<unknown>(BASE), '计费配置');
  }

  async update(input: UpdateMeteringPricingInput): Promise<AppResult<MeteringPricing>> {
    const res = await requestTavern<unknown>(BASE, { method: 'PUT', body: input });
    return parseTavern(meteringPricingSchema, res, '计费配置');
  }
}
