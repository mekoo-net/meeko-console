import type { AppResult } from '@/shared/api/httpTypes';
import { requestDemuxAi, type ItemsEnvelope } from '@/shared/api/httpClient';
import { toUid } from '@/shared/lib/id';
import { displayAmountToQuota, quotaToDisplayAmount } from '@/shared/lib/quota';

import type {
  CreateRedemptionCodesInput,
  CreateRedemptionCodesResult,
  ListRedemptionCodesFilter,
  RedemptionAccount,
  RedemptionClaim,
  RedemptionCode,
  RedemptionStaff,
  RedemptionStatus,
} from '@/features/demuxai/model/redemption.types';
import type {
  DemuxaiRedemptionPort,
  ListRedemptionCodesPage,
} from '@/features/demuxai/services/ports/demuxaiRedemptionPort';

const BASE = '/demuxai/api/redemption';

interface RedemptionAccountRaw {
  uid: string | number;
  owner?: {
    email?: string;
    display_name?: string;
    displayName?: string;
  };
  email?: string;
}

interface RedemptionStaffRaw {
  uid: string | number;
  display_name?: string;
  displayName?: string;
  username?: string;
}

interface RedemptionClaimRaw {
  account: RedemptionAccountRaw;
  redeemed_time: number;
}

interface RedemptionDtoRaw {
  id: number;
  user_id?: number;
  key: string;
  status: number;
  name: string;
  quota: number;
  max_redemptions?: number;
  redeemed_count?: number;
  created_time: number;
  redeemed_time?: number | null;
  count?: number;
  account?: RedemptionAccountRaw | null;
  claims?: RedemptionClaimRaw[];
  created_by?: RedemptionStaffRaw;
  used_user_id?: number | string | null;
  expired_time?: number | null;
}

interface CreateRedemptionsResponseRaw {
  keys: string[];
}

function mapStatus(raw: number): RedemptionStatus {
  if (raw === 2 || raw === 3 || raw === 4) return raw;
  return 1;
}

function mapAccount(raw: RedemptionDtoRaw): RedemptionAccount | null {
  if (raw.account) {
    const uid = toUid(raw.account.uid);
    if (!uid) return null;
    const owner = raw.account.owner;
    const email = owner?.email ?? raw.account.email;
    const displayName = owner?.display_name ?? owner?.displayName;
    return {
      uid,
      owner: email || displayName ? { email, displayName } : undefined,
    };
  }
  const legacyUid = toUid(raw.used_user_id);
  if (!legacyUid) return null;
  return { uid: legacyUid };
}

function mapAccountFromRaw(raw: RedemptionAccountRaw): RedemptionAccount | null {
  const uid = toUid(raw.uid);
  if (!uid) return null;
  const owner = raw.owner;
  const email = owner?.email ?? raw.email;
  const displayName = owner?.display_name ?? owner?.displayName;
  return {
    uid,
    owner: email || displayName ? { email, displayName } : undefined,
  };
}

function mapClaims(raw: RedemptionDtoRaw): RedemptionClaim[] {
  if (!raw.claims?.length) return [];
  const out: RedemptionClaim[] = [];
  for (const c of raw.claims) {
    const account = mapAccountFromRaw(c.account);
    if (!account || !c.redeemed_time) continue;
    out.push({ account, redeemedTime: c.redeemed_time });
  }
  return out;
}

function mapCreatedBy(raw: RedemptionDtoRaw): RedemptionStaff {
  const s = raw.created_by;
  const uid = s ? toUid(s.uid) : null;
  return {
    uid: uid ?? '0',
    displayName: s?.display_name ?? s?.displayName ?? '—',
    username: s?.username,
  };
}

function mapRow(raw: RedemptionDtoRaw): RedemptionCode {
  const maxRedemptions = raw.max_redemptions ?? raw.count ?? 1;
  const redeemedCount = raw.redeemed_count ?? (raw.status === 2 && maxRedemptions <= 1 ? 1 : 0);
  const claims = mapClaims(raw);
  const account = mapAccount(raw);
  return {
    id: raw.id,
    name: raw.name,
    key: raw.key,
    status: mapStatus(raw.status),
    quota: raw.quota,
    maxRedemptions: Math.max(1, maxRedemptions),
    redeemedCount: Math.max(0, redeemedCount),
    createdTime: raw.created_time,
    redeemedTime: raw.redeemed_time ?? null,
    account,
    claims: claims.length > 0 ? claims : account && raw.redeemed_time ? [{ account, redeemedTime: raw.redeemed_time }] : [],
    createdBy: mapCreatedBy(raw),
    expiredTime: raw.expired_time && raw.expired_time > 0 ? raw.expired_time : null,
  };
}

export class DemuxaiRedemptionHttpAdapter implements DemuxaiRedemptionPort {
  async list(input: {
    page: number;
    pageSize: number;
    filter: ListRedemptionCodesFilter;
  }): Promise<AppResult<ListRedemptionCodesPage>> {
    const keyword = input.filter.keyword?.trim();
    const path = keyword ? `${BASE}/search` : BASE;
    const query: Record<string, string | number> = {
      p: input.page,
      size: input.pageSize,
    };
    if (keyword) query.keyword = keyword;

    const result = await requestDemuxAi<ItemsEnvelope<RedemptionDtoRaw>>(path, { query });
    if (!result.success) return result;
    return {
      success: true,
      data: {
        items: result.data.items.map(mapRow),
        total: result.data.total,
      },
    };
  }

  async create(input: CreateRedemptionCodesInput): Promise<AppResult<CreateRedemptionCodesResult>> {
    const expiredSec = input.expiredAtUtc
      ? Math.floor(Date.parse(input.expiredAtUtc) / 1000)
      : null;
    const result = await requestDemuxAi<CreateRedemptionsResponseRaw>(BASE, {
      method: 'POST',
      body: {
        name: input.name.trim(),
        quota: displayAmountToQuota(input.amount),
        count: input.count,
        max_redemptions: input.maxRedemptions,
        expired_time: expiredSec && expiredSec > 0 ? expiredSec : -1,
      },
    });
    if (!result.success) return result;
    return { success: true, data: { keys: result.data.keys ?? [] } };
  }

  async remove(id: number): Promise<AppResult<void>> {
    return requestDemuxAi<void>(`${BASE}/${id}`, { method: 'DELETE' });
  }
}

export function redemptionQuotaToYuan(quota: number): number {
  return quotaToDisplayAmount(quota);
}
