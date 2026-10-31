import { fail, ok, type AppResult } from '@/shared/api/httpTypes';
import { delay } from '@/shared/lib/delay';

import {
  PRICING_MAX,
  meteringUnitSchema,
  type MeteringPricing,
  type PricingRules,
  type UpdateMeteringPricingInput,
} from '../../model/meteringPricing.types';
import { duplicateModelNames } from '../../model/pricingPreview';
import type { TavernPricingPort } from '../ports/tavernPricingPort';
import { currentPricing, mockModels, replacePricing } from './tavernMeteringMockData';

/** 与服务端同文案：页面靠它认出版本冲突。 */
const CONFLICT_MESSAGE = '定价已被修改，请刷新后再保存。';

function snapshot(): MeteringPricing {
  return { ...currentPricing(), models: mockModels() };
}

function isFactor(value: number): boolean {
  return value > 0 && value <= PRICING_MAX;
}

/** 同服务端 `PricingRulesDto.Validate`：缺单位就是那类用量白送，倍率为 0 同理。 */
function validate(rules: PricingRules): string | null {
  const units = rules.baselines.map((b) => b.unit);
  const missing = meteringUnitSchema.options.find((u) => !units.includes(u));
  if (missing) return `缺少「${missing}」的基线价格。`;
  if (new Set(units).size !== units.length) return '计量单位重复。';
  const badPrice = rules.baselines.find((b) => b.price < 0 || b.price > PRICING_MAX);
  if (badPrice) return `「${badPrice.unit}」的基线价格超出范围。`;
  if (!isFactor(rules.defaultModelMultiplier)) return '默认模型倍率必须大于 0。';
  if (!isFactor(rules.completionWeight)) return '输出权重必须大于 0。';
  if (!isFactor(rules.proactiveRateMultiplier)) return '自主唤醒倍率必须大于 0。';
  if (rules.modelMultipliers.some((m) => !m.modelName.trim())) return '模型名不能为空。';
  const [dupe] = duplicateModelNames(rules.modelMultipliers);
  if (dupe) return `模型「${dupe}」重复配置了倍率。`;
  const bad = rules.modelMultipliers.find((m) => !isFactor(m.multiplier));
  if (bad) return `模型「${bad.modelName}」的倍率必须大于 0。`;
  return null;
}

export class TavernPricingMock implements TavernPricingPort {
  async get(): Promise<AppResult<MeteringPricing>> {
    await delay();
    return ok(snapshot());
  }

  async update(input: UpdateMeteringPricingInput): Promise<AppResult<MeteringPricing>> {
    await delay();
    const error = validate(input.rules);
    if (error) return fail({ code: 'validation', message: error });
    if (input.version !== currentPricing().version) return fail({ code: 'unknown', message: CONFLICT_MESSAGE });
    replacePricing({
      ...input.rules,
      modelMultipliers: input.rules.modelMultipliers.map((m) => ({ ...m, modelName: m.modelName.trim() })),
    });
    return ok(snapshot());
  }
}
