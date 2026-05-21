import { fail, ok, type AppResult } from '@/shared/api/httpTypes';
import { delay } from '@/shared/lib/delay';

import {
  draftPaymentChannel,
  type AlipayConfig,
  type PaymentChannel,
  type PaymentProviderCode,
  type WechatPayConfig,
} from '../../model/paymentChannel.types';
import type { PaymentChannelPort } from '../ports/paymentChannelPort';

const seedChannels: PaymentChannel[] = [
  {
    id: 'PC-001',
    code: 'alipay',
    name: '支付宝',
    description: '支付宝扫码（Native）/ H5 / PC 网站支付，实时到账。需要在支付宝开放平台创建应用并完成签约。',
    isActive: true,
    supportedScenes: [0, 1, 4],
    isConfigured: false,
    createdAtUtc: '2026-01-01T00:00:00Z',
  },
  {
    id: 'PC-002',
    code: 'wechat_pay',
    name: '微信支付',
    description: '微信 Native / JsApi / H5 支付，需商户平台开通对应支付类型。',
    isActive: true,
    supportedScenes: [0, 1, 2],
    isConfigured: false,
    createdAtUtc: '2026-01-01T00:00:00Z',
  },
];

const channelStore = new Map<string, PaymentChannel>(seedChannels.map((c) => [c.code, c]));
let alipayConfig: AlipayConfig | null = null;
let wechatPayConfig: WechatPayConfig | null = null;

function ensureChannel(code: PaymentProviderCode): PaymentChannel {
  const existing = channelStore.get(code);
  if (existing) return existing;
  const draft = draftPaymentChannel(code);
  const ch: PaymentChannel = {
    ...draft,
    id: code === 'alipay' ? 'PC-001' : 'PC-002',
  };
  channelStore.set(code, ch);
  return ch;
}

export class PaymentChannelMock implements PaymentChannelPort {
  async listChannels(): Promise<AppResult<PaymentChannel[]>> {
    await delay();
    return ok(Array.from(channelStore.values()));
  }

  async setActive(code: PaymentProviderCode, active: boolean): Promise<AppResult<PaymentChannel>> {
    await delay();
    const ch = channelStore.get(code);
    if (!ch) return fail({ code: 'not_found', message: `渠道 ${code} 不存在` });
    const next: PaymentChannel = { ...ch, isActive: active };
    channelStore.set(code, next);
    return ok(next);
  }

  async getAlipayConfig(): Promise<AppResult<AlipayConfig | null>> {
    await delay(200);
    return ok(alipayConfig);
  }

  async saveAlipayConfig(config: AlipayConfig): Promise<AppResult<void>> {
    await delay(400);
    if (!config.appId.trim()) {
      return fail({ code: 'validation', message: '应用 ID 不能为空' });
    }
    if (!config.privateKey.trim()) {
      return fail({ code: 'validation', message: '应用私钥不能为空' });
    }
    if (!config.alipayPublicKey.trim()) {
      return fail({ code: 'validation', message: '支付宝公钥不能为空' });
    }
    alipayConfig = { ...config };
    const ch = ensureChannel('alipay');
    channelStore.set('alipay', { ...ch, isConfigured: true });
    return ok(undefined);
  }

  async getWechatPayConfig(): Promise<AppResult<WechatPayConfig | null>> {
    await delay(200);
    return ok(wechatPayConfig);
  }

  async saveWechatPayConfig(config: WechatPayConfig): Promise<AppResult<void>> {
    await delay(400);
    if (!config.appId.trim()) {
      return fail({ code: 'validation', message: 'AppId 不能为空' });
    }
    if (!config.mchId.trim()) {
      return fail({ code: 'validation', message: '商户号不能为空' });
    }
    if (config.apiV3Key.trim().length !== 32) {
      return fail({ code: 'validation', message: 'APIv3 密钥必须为 32 字符' });
    }
    if (!config.certSerialNo.trim()) {
      return fail({ code: 'validation', message: '证书序列号不能为空' });
    }
    if (!config.privateKey.trim()) {
      return fail({ code: 'validation', message: '商户私钥不能为空' });
    }
    wechatPayConfig = { ...config };
    const ch = ensureChannel('wechat_pay');
    channelStore.set('wechat_pay', { ...ch, isConfigured: true });
    return ok(undefined);
  }
}
