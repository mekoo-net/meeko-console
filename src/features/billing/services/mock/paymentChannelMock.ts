import { fail, ok, type AppResult } from '@/shared/api/httpTypes';
import { delay } from '@/shared/lib/delay';

import type {
  ChannelConfigSchema,
  ChannelConfigValues,
  PaymentChannel,
} from '../../model/paymentChannel.types';
import type { PaymentChannelPort } from '../ports/paymentChannelPort';

const seedChannels: PaymentChannel[] = [
  { code: 'alipay', name: '支付宝', isActive: false, isConfigured: false, supportedScenes: ['native', 'h5', 'pc'] },
  { code: 'wechat_pay', name: '微信支付', isActive: false, isConfigured: false, supportedScenes: ['native', 'h5', 'jsapi'] },
  { code: 'fkpay', name: '发卡付', isActive: false, isConfigured: false, supportedScenes: ['redirect'] },
  { code: 'manual', name: '手工入账', isActive: true, isConfigured: true, supportedScenes: ['manual'] },
];

const schemas: Record<string, ChannelConfigSchema> = {
  alipay: {
    code: 'alipay',
    displayName: '支付宝',
    fields: [
      { key: 'appId', label: 'AppId', type: 'Text', isSecret: false, required: true },
      { key: 'appPrivateKey', label: '应用私钥', type: 'TextArea', isSecret: true, required: true },
    ],
  },
  fkpay: {
    code: 'fkpay',
    displayName: '发卡付',
    fields: [
      { key: 'baseUrl', label: '网关地址', type: 'Url', isSecret: false, required: true },
      { key: 'appId', label: 'AppId', type: 'Text', isSecret: false, required: true },
      { key: 'appSecret', label: 'AppSecret', type: 'Password', isSecret: true, required: true },
    ],
  },
};

const channelStore = new Map(seedChannels.map((c) => [c.code, { ...c }]));
const configStore = new Map<string, Record<string, string>>();

export class PaymentChannelMock implements PaymentChannelPort {
  async listChannels(): Promise<AppResult<PaymentChannel[]>> {
    await delay();
    return ok(Array.from(channelStore.values()));
  }

  async setActive(code: string, active: boolean): Promise<AppResult<PaymentChannel>> {
    await delay();
    const ch = channelStore.get(code);
    if (!ch) return fail({ code: 'not_found', message: `渠道 ${code} 不存在` });
    const next = { ...ch, isActive: active };
    channelStore.set(code, next);
    return ok(next);
  }

  async getChannelSchema(code: string): Promise<AppResult<ChannelConfigSchema | null>> {
    await delay(100);
    return ok(schemas[code] ?? { code, displayName: code, fields: [] });
  }

  async getChannelConfig(code: string): Promise<AppResult<ChannelConfigValues | null>> {
    await delay(100);
    return ok({ code, values: { ...(configStore.get(code) ?? {}) } });
  }

  async saveChannelConfig(code: string, values: Record<string, string>): Promise<AppResult<void>> {
    await delay(200);
    configStore.set(code, { ...values });
    const ch = channelStore.get(code);
    if (ch) channelStore.set(code, { ...ch, isConfigured: true });
    return ok(undefined);
  }
}
