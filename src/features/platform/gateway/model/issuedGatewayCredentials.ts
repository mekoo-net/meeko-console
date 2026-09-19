/**
 * HMAC 网关凭据不落库。列表只能展示本控制台这次会话签发过的 ClientId，
 * Secret 仍然只在签发当页出现一次。
 */
import { ref } from 'vue';

import type { GatewayProductId } from './products';

const STORAGE_KEY = 'platform.gateway.issued.v1';

export interface IssuedGatewayRecord {
  productId: GatewayProductId;
  productLabel: string;
  backendId: string;
  clientId: string;
  name: string;
  /** UTC ISO，给 formatDateTime 用。 */
  issuedAt: string;
}

function readStored(): IssuedGatewayRecord[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isRecord);
  } catch {
    return [];
  }
}

function isRecord(v: unknown): v is IssuedGatewayRecord {
  if (v == null || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return (
    (o.productId === 'demux' || o.productId === 'tavern') &&
    typeof o.productLabel === 'string' &&
    typeof o.clientId === 'string' &&
    typeof o.name === 'string' &&
    typeof o.backendId === 'string' &&
    typeof o.issuedAt === 'string'
  );
}

export const issuedGatewayRecords = ref<IssuedGatewayRecord[]>(readStored());

export function rememberIssuedGateway(row: IssuedGatewayRecord): void {
  issuedGatewayRecords.value = [
    row,
    ...issuedGatewayRecords.value.filter((r) => r.clientId !== row.clientId),
  ];
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(issuedGatewayRecords.value));
  } catch {
    /* 隐私模式 / 配额满时只留内存 */
  }
}
