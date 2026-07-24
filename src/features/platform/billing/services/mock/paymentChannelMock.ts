import { fail, ok, type AppResult } from '@/shared/api/httpTypes';
import { delay } from '@/shared/lib/delay';

import type {
  ChannelConfigField,
  ChannelConfigSchema,
  ChannelConfigValues,
  ChannelType,
  PaymentChannel,
} from '../../model/paymentChannel.types';
import type { PaymentChannelPort } from '../ports/paymentChannelPort';

type DriverDef = {
  code: string;
  displayName: string;
  allowMultiple: boolean;
  supportedScenes: string[];
  fields: ChannelConfigField[];
};

const drivers: DriverDef[] = [
  {
    code: 'alipay',
    displayName: '支付宝',
    allowMultiple: true,
    supportedScenes: ['native', 'h5', 'pc'],
    fields: [
      { key: 'appId', label: 'AppId', type: 'Text', isSecret: false, required: true },
      { key: 'appPrivateKey', label: '应用私钥', type: 'TextArea', isSecret: true, required: true },
      { key: 'alipayPublicKey', label: '支付宝公钥', type: 'TextArea', isSecret: true, required: true },
    ],
  },
  {
    code: 'wechat_pay',
    displayName: '微信支付',
    allowMultiple: true,
    supportedScenes: ['native', 'h5', 'jsapi'],
    fields: [
      { key: 'appId', label: 'AppId', type: 'Text', isSecret: false, required: true },
      { key: 'merchantId', label: '商户号', type: 'Text', isSecret: false, required: true },
      { key: 'apiV3Key', label: 'APIv3 密钥', type: 'Password', isSecret: true, required: true },
    ],
  },
  {
    code: 'fkpay',
    displayName: '发卡付',
    allowMultiple: true,
    supportedScenes: ['redirect'],
    fields: [
      { key: 'baseUrl', label: '网关地址', type: 'Url', isSecret: false, required: true },
      { key: 'appId', label: 'AppId', type: 'Text', isSecret: false, required: true },
      { key: 'appSecret', label: 'AppSecret', type: 'Password', isSecret: true, required: true },
    ],
  },
  {
    code: 'manual',
    displayName: '手工入账',
    allowMultiple: false,
    supportedScenes: ['manual'],
    fields: [],
  },
];

const driverByCode = new Map(drivers.map((d) => [d.code, d]));

let nextId = 1;
const channelStore = new Map<number, PaymentChannel>();
const configStore = new Map<number, Record<string, string>>();

// 种子：一个手工入账单例 + 一个未配置的支付宝实例，便于演示。
function seed(driverCode: string, name: string, active: boolean, configured: boolean): void {
  const d = driverByCode.get(driverCode)!;
  const id = nextId++;
  channelStore.set(id, {
    id,
    driverCode: d.code,
    name,
    driverName: d.displayName,
    isActive: active,
    isConfigured: configured,
    supportedScenes: d.supportedScenes,
  });
}
seed('manual', '手工入账', true, true);
seed('alipay', '支付宝-主账户', false, false);

export class PaymentChannelMock implements PaymentChannelPort {
  async listChannels(): Promise<AppResult<PaymentChannel[]>> {
    await delay();
    return ok(Array.from(channelStore.values()).map((c) => ({ ...c })));
  }

  async listChannelTypes(): Promise<AppResult<ChannelType[]>> {
    await delay(100);
    return ok(
      drivers.map((d) => ({
        code: d.code,
        displayName: d.displayName,
        allowMultiple: d.allowMultiple,
        instanceCount: Array.from(channelStore.values()).filter((c) => c.driverCode === d.code).length,
        supportedScenes: d.supportedScenes,
        fields: d.fields,
      })),
    );
  }

  async createChannel(driverCode: string, displayName: string): Promise<AppResult<PaymentChannel>> {
    await delay(200);
    const d = driverByCode.get(driverCode);
    if (!d) return fail({ code: 'not_found', message: `支付类型 ${driverCode} 不存在` });
    const count = Array.from(channelStore.values()).filter((c) => c.driverCode === driverCode).length;
    if (!d.allowMultiple && count > 0) {
      return fail({ code: 'validation', message: `${d.displayName} 不支持创建多个实例` });
    }
    const id = nextId++;
    const ch: PaymentChannel = {
      id,
      driverCode: d.code,
      name: displayName,
      driverName: d.displayName,
      isActive: false,
      isConfigured: d.fields.length === 0,
      supportedScenes: d.supportedScenes,
    };
    channelStore.set(id, ch);
    return ok({ ...ch });
  }

  async deleteChannel(id: number): Promise<AppResult<void>> {
    await delay(150);
    const ch = channelStore.get(id);
    if (!ch) return fail({ code: 'not_found', message: `渠道 #${id} 不存在` });
    const d = driverByCode.get(ch.driverCode);
    if (d && !d.allowMultiple) return fail({ code: 'validation', message: `${ch.name} 不可删除` });
    channelStore.delete(id);
    configStore.delete(id);
    return ok(undefined);
  }

  async setActive(id: number, active: boolean): Promise<AppResult<PaymentChannel>> {
    await delay();
    const ch = channelStore.get(id);
    if (!ch) return fail({ code: 'not_found', message: `渠道 #${id} 不存在` });
    if (active && !ch.isConfigured) {
      return fail({ code: 'validation', message: '请先完成配置再启用' });
    }
    const next = { ...ch, isActive: active };
    channelStore.set(id, next);
    return ok({ ...next });
  }

  async getChannelSchema(id: number): Promise<AppResult<ChannelConfigSchema | null>> {
    await delay(100);
    const ch = channelStore.get(id);
    if (!ch) return ok(null);
    const d = driverByCode.get(ch.driverCode)!;
    return ok({ code: d.code, displayName: d.displayName, fields: d.fields });
  }

  async getChannelConfig(id: number): Promise<AppResult<ChannelConfigValues | null>> {
    await delay(100);
    const ch = channelStore.get(id);
    if (!ch) return ok(null);
    return ok({ channelId: id, values: { ...(configStore.get(id) ?? {}) } });
  }

  async saveChannelConfig(id: number, values: Record<string, string>): Promise<AppResult<void>> {
    await delay(200);
    const ch = channelStore.get(id);
    if (!ch) return fail({ code: 'not_found', message: `渠道 #${id} 不存在` });
    configStore.set(id, { ...values });
    channelStore.set(id, { ...ch, isConfigured: true });
    return ok(undefined);
  }
}
