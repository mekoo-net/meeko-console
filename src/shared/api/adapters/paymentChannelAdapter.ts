import type { AppResult } from '@/shared/api/httpTypes';
import { request } from '@/shared/api/httpClient';

import type {
  AlipayConfig,
  PaymentChannel,
  PaymentProviderCode,
  WechatPayConfig,
} from '@/features/billing/model/paymentChannel.types';
import type { PaymentChannelPort } from '@/features/billing/services/ports/paymentChannelPort';

const BASE = '/api/admin/billing/channels';

export class PaymentChannelHttpAdapter implements PaymentChannelPort {
  async listChannels(): Promise<AppResult<PaymentChannel[]>> {
    return request<PaymentChannel[]>(BASE);
  }

  async setActive(code: PaymentProviderCode, active: boolean): Promise<AppResult<PaymentChannel>> {
    return request<PaymentChannel>(`${BASE}/${code}/active`, {
      method: 'PATCH',
      body: { active },
    });
  }

  async getAlipayConfig(): Promise<AppResult<AlipayConfig | null>> {
    return request<AlipayConfig | null>(`${BASE}/alipay/config`);
  }

  async saveAlipayConfig(config: AlipayConfig): Promise<AppResult<void>> {
    return request<void>(`${BASE}/alipay/config`, { method: 'PUT', body: config });
  }

  async getWechatPayConfig(): Promise<AppResult<WechatPayConfig | null>> {
    return request<WechatPayConfig | null>(`${BASE}/wechat_pay/config`);
  }

  async saveWechatPayConfig(config: WechatPayConfig): Promise<AppResult<void>> {
    return request<void>(`${BASE}/wechat_pay/config`, { method: 'PUT', body: config });
  }
}
