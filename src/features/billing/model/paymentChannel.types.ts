export const paymentProviderCodes = ['alipay', 'wechat_pay'] as const;
export type PaymentProviderCode = (typeof paymentProviderCodes)[number];

export const PaymentProviderLabel: Readonly<Record<PaymentProviderCode, string>> = {
  alipay: '支付宝',
  wechat_pay: '微信支付',
};

/** 创建渠道时的展示模板（列表中尚无该 code 时使用） */
export interface PaymentChannelTemplate {
  name: string;
  description: string;
  supportedScenes: number[];
}

export const paymentChannelTemplates: Readonly<Record<PaymentProviderCode, PaymentChannelTemplate>> = {
  alipay: {
    name: '支付宝',
    description:
      '支付宝扫码（Native）/ H5 / PC 网站支付，实时到账。需要在支付宝开放平台创建应用并完成签约。',
    supportedScenes: [0, 1, 4],
  },
  wechat_pay: {
    name: '微信支付',
    description: '微信 Native / JsApi / H5 支付，需商户平台开通对应支付类型。',
    supportedScenes: [0, 1, 2],
  },
};

export function draftPaymentChannel(code: PaymentProviderCode): PaymentChannel {
  const tpl = paymentChannelTemplates[code];
  return {
    id: '',
    code,
    name: tpl.name,
    description: tpl.description,
    isActive: false,
    supportedScenes: [...tpl.supportedScenes],
    isConfigured: false,
    createdAtUtc: new Date().toISOString(),
  };
}

export interface PaymentChannel {
  /** 渠道配置行主键（API JSON `id`，如 PC-001 / ch-alipay） */
  id: string;
  code: PaymentProviderCode;
  name: string;
  description: string;
  isActive: boolean;
  supportedScenes: number[];
  createdAtUtc: string;
  /** 是否已保存过配置（前端展示用） */
  isConfigured: boolean;
}

/* ───────── 支付宝配置（对齐 essensoft/paylink AlipayOptions） ───────── */
export interface AlipayConfig {
  appId: string;
  /** 应用私钥（RSA2/PKCS8 格式，不含 BEGIN/END header） */
  privateKey: string;
  /** 支付宝公钥（来自开放平台"应用详情 → 开发信息"） */
  alipayPublicKey: string;
  /** 签名类型，推荐 RSA2 */
  signType: 'RSA2' | 'RSA';
  /** 内容加密密钥（AES-128-CBC），可选 */
  encryptKey: string;
  /** 网关地址，默认正式环境 */
  gatewayUrl: string;
  /** 异步通知回调地址 */
  notifyUrl: string;
  /** 同步跳转地址 */
  returnUrl: string;
  isSandbox: boolean;
}

/* ───────── 微信支付配置（对齐 essensoft/paylink WeChatPayOptions V3） ───────── */
export interface WechatPayConfig {
  /** 应用 AppId（公众号/小程序/App） */
  appId: string;
  /** 商户号 */
  mchId: string;
  /** APIv3 密钥（32字节随机字符串，在商户平台设置） */
  apiV3Key: string;
  /** 商户 API 证书序列号（cert.pem 中读取） */
  certSerialNo: string;
  /** 商户私钥（apiclient_key.pem 完整内容） */
  privateKey: string;
  /** 支付结果通知地址 */
  notifyUrl: string;
  isSandbox: boolean;
}

export type ChannelConfig = AlipayConfig | WechatPayConfig;

export type ChannelConfigMap = {
  alipay: AlipayConfig;
  wechat_pay: WechatPayConfig;
};

export const defaultAlipayConfig = (): AlipayConfig => ({
  appId: '',
  privateKey: '',
  alipayPublicKey: '',
  signType: 'RSA2',
  encryptKey: '',
  gatewayUrl: 'https://openapi.alipay.com/gateway.do',
  notifyUrl: '',
  returnUrl: '',
  isSandbox: false,
});

export const defaultWechatPayConfig = (): WechatPayConfig => ({
  appId: '',
  mchId: '',
  apiV3Key: '',
  certSerialNo: '',
  privateKey: '',
  notifyUrl: '',
  isSandbox: false,
});
