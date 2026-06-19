import type { AppResult } from '@/shared/api/httpTypes';

import type {
  ChannelConfigSchema,
  ChannelConfigValues,
  PaymentChannel,
} from '../../model/paymentChannel.types';

export interface PaymentChannelPort {
  listChannels(): Promise<AppResult<PaymentChannel[]>>;
  setActive(code: string, active: boolean): Promise<AppResult<PaymentChannel>>;

  getChannelSchema(code: string): Promise<AppResult<ChannelConfigSchema | null>>;
  getChannelConfig(code: string): Promise<AppResult<ChannelConfigValues | null>>;
  saveChannelConfig(code: string, values: Record<string, string>): Promise<AppResult<void>>;
}
