import { z } from 'zod';

import { asEpochMillis, asEpochMillisNullable } from '@/shared/lib/epoch';

export const platformApiKeySchema = z.object({
  id: z.string(),
  name: z.string(),
  keyHint: z.string(),
  scopes: z.array(z.string()),
  issuedByStaffUid: z.string(),
  expiresAtUtc: z.number().int().nullable(),
  revokedAtUtc: z.number().int().nullable(),
  lastUsedAtUtc: z.number().int().nullable(),
  createdAtUtc: z.number().int(),
});

export type PlatformApiKey = z.infer<typeof platformApiKeySchema>;

export function mapPlatformApiKey(raw: Record<string, unknown>): PlatformApiKey {
  return platformApiKeySchema.parse({
    id: String(raw.id ?? ''),
    name: raw.name,
    keyHint: raw.keyHint ?? raw.key_hint ?? '',
    scopes: raw.scopes ?? [],
    issuedByStaffUid: String(raw.issuedByStaffUid ?? raw.issued_by_staff_uid ?? ''),
    expiresAtUtc: asEpochMillisNullable(raw.expiresAtUtc ?? raw.expires_at_utc),
    revokedAtUtc: asEpochMillisNullable(raw.revokedAtUtc ?? raw.revoked_at_utc),
    lastUsedAtUtc: asEpochMillisNullable(raw.lastUsedAtUtc ?? raw.last_used_at_utc),
    createdAtUtc: asEpochMillis(raw.createdAtUtc ?? raw.created_at_utc) ?? 0,
  });
}

export type ApiKeyStatus = 'active' | 'expired' | 'revoked';

export function apiKeyStatus(row: PlatformApiKey, now = Date.now()): ApiKeyStatus {
  if (row.revokedAtUtc) return 'revoked';
  if (row.expiresAtUtc && row.expiresAtUtc <= now) return 'expired';
  return 'active';
}

export function apiKeyStatusLabel(status: ApiKeyStatus): string {
  if (status === 'revoked') return '已吊销';
  if (status === 'expired') return '已过期';
  return '有效';
}

/** 现有接口中文说明。目录以 GET scopes 为准，这里只负责展示。 */
export const API_KEY_SCOPE_LABELS: Record<string, string> = {
  'GET /api/admin/accounts': '查找账户',
  'POST /api/admin/billing/voucher/templates/{templateId}/issue': '按模板发卡',
};

export function apiKeyScopeLabel(code: string): string {
  return API_KEY_SCOPE_LABELS[code] ?? code;
}

export const FALLBACK_API_KEY_SCOPES = [
  'GET /api/admin/accounts',
  'POST /api/admin/billing/voucher/templates/{templateId}/issue',
];
