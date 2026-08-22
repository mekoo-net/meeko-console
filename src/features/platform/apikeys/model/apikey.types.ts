import { z } from 'zod';

import {
  permissionCatalogItemSchema,
  permissionLabel,
  type PermissionCatalogItem,
} from '@/features/platform/staff/model/staff.types';
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
  plaintext: z.string().nullable().optional(),
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
    plaintext: typeof raw.plaintext === 'string' && raw.plaintext.length > 0 ? raw.plaintext : null,
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

export function apiKeyScopeLabel(code: string): string {
  return permissionLabel(code);
}

export function mapPermissionCatalog(raw: unknown): PermissionCatalogItem[] {
  const rows = Array.isArray(raw) ? raw : [];
  return rows
    .map((row) => {
      const item = row as Record<string, unknown>;
      const parsed = permissionCatalogItemSchema.safeParse({
        id: String(item.id ?? item.code ?? ''),
        code: String(item.code ?? ''),
        description: item.description == null ? null : String(item.description),
      });
      return parsed.success ? parsed.data : null;
    })
    .filter((x): x is PermissionCatalogItem => x != null && x.code.length > 0);
}
