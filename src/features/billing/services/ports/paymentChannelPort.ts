import type { AppResult } from '@/shared/api/httpTypes';

import type {
  AlipayConfig,
  PaymentChannel,
  PaymentProviderCode,
  WechatPayConfig,
} from '../../model/paymentChannel.types';

export interface PaymentChannelPort {
  listChannels(): Promise<AppResult<PaymentChannel[]>>;
  setActive(code: PaymentProviderCode, active: boolean): Promise<AppResult<PaymentChannel>>;

  getAlipayConfig(): Promise<AppResult<AlipayConfig | null>>;
  saveAlipayConfig(config: AlipayConfig): Promise<AppResult<void>>;

  getWechatPayConfig(): Promise<AppResult<WechatPayConfig | null>>;
  saveWechatPayConfig(config: WechatPayConfig): Promise<AppResult<void>>;
}
