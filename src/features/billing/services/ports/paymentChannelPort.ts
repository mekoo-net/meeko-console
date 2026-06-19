import type { AppResult } from '@/shared/api/httpTypes';

import type {
  ChannelConfigSchema,
  ChannelConfigValues,
  ChannelType,
  PaymentChannel,
} from '../../model/paymentChannel.types';

export interface PaymentChannelPort {
  /** 已创建的渠道实例列表。 */
  listChannels(): Promise<AppResult<PaymentChannel[]>>;
  /** 可创建的支付类型（驱动）列表。 */
  listChannelTypes(): Promise<AppResult<ChannelType[]>>;
  /** 新建一个渠道实例。 */
  createChannel(driverCode: string, displayName: string): Promise<AppResult<PaymentChannel>>;
  /** 删除一个渠道实例。 */
  deleteChannel(id: number): Promise<AppResult<void>>;

  setActive(id: number, active: boolean): Promise<AppResult<PaymentChannel>>;

  getChannelSchema(id: number): Promise<AppResult<ChannelConfigSchema | null>>;
  getChannelConfig(id: number): Promise<AppResult<ChannelConfigValues | null>>;
  saveChannelConfig(id: number, values: Record<string, string>): Promise<AppResult<void>>;
}
