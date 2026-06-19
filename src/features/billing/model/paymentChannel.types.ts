/** 支付渠道（来自 Billing API PaymentChannelDto + 前端展示字段）。 */
export interface PaymentChannel {
  code: string;
  name: string;
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
  code: string;
  displayName: string;
  fields: ChannelConfigField[];
}

export interface ChannelConfigValues {
  code: string;
  values: Record<string, string>;
}

/** 渠道卡片配色（可选，未知渠道用默认色）。 */
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

export function channelDisplayName(code: string, fallback?: string): string {
  return fallback ?? code;
}

export function channelColor(code: string): string {
  return providerColor[code] ?? '#595959';
}

export function channelBg(code: string): string {
  return providerBg[code] ?? '#f0f0f0';
}
