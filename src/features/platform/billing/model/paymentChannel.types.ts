/** 支付渠道「实例」（来自 Billing API PaymentChannelDto + 前端展示字段）。 */
export interface PaymentChannel {
  /** 实例 Id，配置/启停/删除均以它定位。 */
  id: number;
  /** 支付类型 / 驱动 code，如 alipay / wechat_pay / fkpay / manual。 */
  driverCode: string;
  /** 实例展示名（管理员自定义，如「支付宝-主账户」）。 */
  name: string;
  /** 支付类型展示名（如「支付宝」）。 */
  driverName?: string;
  isActive: boolean;
  isConfigured: boolean;
  /** 场景标识，如 native / h5 / redirect */
  supportedScenes: string[];
}

export type ChannelFieldType = 'Text' | 'Password' | 'Url' | 'Boolean' | 'TextArea';

export interface ChannelConfigField {
  key: string;
  label: string;
  type: ChannelFieldType;
  isSecret: boolean;
  required: boolean;
  placeholder?: string | null;
  help?: string | null;
}

export interface ChannelConfigSchema {
  /** 驱动 code。 */
  code: string;
  displayName: string;
  fields: ChannelConfigField[];
}

export interface ChannelConfigValues {
  channelId: number;
  values: Record<string, string>;
}

/** 可创建的支付类型（驱动），供新建实例时选择。 */
export interface ChannelType {
  /** 驱动 code。 */
  code: string;
  displayName: string;
  /** 是否允许创建多个实例（手工入账为 false）。 */
  allowMultiple: boolean;
  /** 已创建实例数。 */
  instanceCount: number;
  supportedScenes: string[];
  fields: ChannelConfigField[];
}

/** 渠道卡片配色（按驱动 code，未知渠道用默认色）。 */
export const providerColor: Record<string, string> = {
  alipay: '#1677ff',
  wechat_pay: '#07c160',
  fkpay: '#722ed1',
  manual: '#8c8c8c',
};

export const providerBg: Record<string, string> = {
  alipay: '#e8f3ff',
  wechat_pay: '#e8f9ef',
  fkpay: '#f3e8ff',
  manual: '#f5f5f5',
};

export function channelColor(driverCode: string): string {
  return providerColor[driverCode] ?? '#595959';
}

export function channelBg(driverCode: string): string {
  return providerBg[driverCode] ?? '#f0f0f0';
}
