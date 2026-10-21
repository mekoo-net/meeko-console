/**
 * 外部业务网关接入产品。签发入口在平台设置，各产品共用同一套 UI，
 * 真正的 POST 仍打到各自控制面。
 */
export type GatewayProductId = 'yomi' | 'tavern';

export interface GatewayProduct {
  id: GatewayProductId;
  label: string;
  hint: string;
  configHint: string;
  requireName: boolean;
}

export const GATEWAY_PRODUCTS: readonly GatewayProduct[] = [
  {
    id: 'yomi',
    label: 'Yomi',
    hint: 'Yomi.Gateway → Meeko.Yomi 7072 RPC',
    configHint:
      '写入 Yomi.Gateway 配置 Yomi:ClientId / Yomi:ClientSecret；主密钥 Meeko:Yomi:LlmBackend:HmacKeyBase64 需在平台侧单独配置。',
    requireName: true,
  },
  {
    id: 'tavern',
    label: 'Tavern',
    hint: 'Tavern.Gateway → Meeko.Tavern 7082 BackendRpc',
    configHint:
      '写入 Tavern.Gateway 配置 Meeko:Tavern:Platform:ClientId / ClientSecret；主密钥 Meeko:Tavern:LlmBackend:HmacKeyBase64 需在平台侧单独配置。',
    requireName: true,
  },
];

export function gatewayProductById(id: string): GatewayProduct {
  return GATEWAY_PRODUCTS.find((p) => p.id === id) ?? GATEWAY_PRODUCTS[0]!;
}
