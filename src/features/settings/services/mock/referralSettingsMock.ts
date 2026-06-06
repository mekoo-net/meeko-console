import { fail, ok, type AppResult } from '@/shared/api/httpTypes';
import { delay } from '@/shared/lib/delay';

import {
  referralSettingsAdminSchema,
  type ReferralSettingsAdmin,
  type UpdateReferralSettingsInput,
} from '../../model/settings.types';
import type { ReferralSettingsPort } from '../ports/referralSettingsPort';

let state: ReferralSettingsAdmin = {
  productRates: [
    {
      productCode: 'demuxai',
      productName: 'DemuxAI',
      enabled: true,
      rebateRatePercent: 5,
      minWithdrawAmount: 10,
      withdrawReviewRequired: true,
    },
    {
      productCode: 'meeko',
      productName: 'Meeko 平台',
      enabled: true,
      rebateRatePercent: 3,
      minWithdrawAmount: 10,
      withdrawReviewRequired: true,
    },
    {
      productCode: 'meeko_voice',
      productName: 'Meeko Voice',
      enabled: false,
      rebateRatePercent: 0,
      minWithdrawAmount: 0,
      withdrawReviewRequired: false,
    },
  ],
  updatedAtUtc: Date.now(),
};

function parse(value: ReferralSettingsAdmin): AppResult<ReferralSettingsAdmin> {
  const r = referralSettingsAdminSchema.safeParse(value);
  return r.success
    ? ok(r.data)
    : fail({ code: 'validation', message: '返利设置数据格式错误' });
}

export class ReferralSettingsMock implements ReferralSettingsPort {
  async get(): Promise<AppResult<ReferralSettingsAdmin>> {
    await delay();
    return parse(state);
  }

  async update(input: UpdateReferralSettingsInput): Promise<AppResult<ReferralSettingsAdmin>> {
    await delay();
    state = {
      ...state,
      ...input,
      updatedAtUtc: Date.now(),
    };
    return parse(state);
  }
}
