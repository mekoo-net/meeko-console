import type { AppResult } from '@/shared/api/httpTypes';
import { requestDemuxAi, type ItemsEnvelope } from '@/shared/api/httpClient';
import { toUid } from '@/shared/lib/id';
import { displayAmountToQuota, quotaToDisplayAmount } from '@/shared/lib/quota';

import type { RedemptionStats } from '@/features/demuxai/model/redemptionDisplay';
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

const BASE = '/demux/api/redemption';

interface RedemptionAccountRaw {
  uid: string | number;
  owner?: {
    email?: string;
    displayName?: string;
  };
  email?: string;
}

interface RedemptionStaffRaw {
  uid: string | number;
  displayName?: string;
  username?: string;
}

interface RedemptionClaimRaw {
  account: RedemptionAccountRaw;
  redeemedTime: number;
}

/** 后端 RedemptionDto wire（camelCase）。 */
interface RedemptionDtoRaw {
  id: number;
  key: string;
  status: number;
  name: string;
  quota: number;
  maxRedemptions?: number;
  redeemedCount?: number;
  createdTime: number;
  redeemedTime?: number | null;
  count?: number;
  account?: RedemptionAccountRaw | null;
  claims?: RedemptionClaimRaw[];
  createdBy?: RedemptionStaffRaw;
  expiredTime?: number | null;
}

interface CreateRedemptionsResponseRaw {
  keys: string[];
}

/** 后端 unix 秒 → 前端毫秒；已是毫秒则原样返回。 */
function wireEpochToMillis(value: number | null | undefined): number | null {
  if (value == null || value <= 0) return null;
  return value < 1_000_000_000_000 ? value * 1000 : value;
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
    const displayName = owner?.displayName;
    return {
      uid,
      owner: email || displayName ? { email, displayName } : undefined,
    };
  }
  return null;
}

function mapAccountFromRaw(raw: RedemptionAccountRaw): RedemptionAccount | null {
  const uid = toUid(raw.uid);
  if (!uid) return null;
  const owner = raw.owner;
  const email = owner?.email ?? raw.email;
  const displayName = owner?.displayName;
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
    const redeemedTime = wireEpochToMillis(c.redeemedTime);
    if (!account || !redeemedTime) continue;
    out.push({ account, redeemedTime });
  }
  return out;
}

function mapCreatedBy(raw: RedemptionDtoRaw): RedemptionStaff {
  const s = raw.createdBy;
  const uid = s ? toUid(s.uid) : null;
  return {
    uid: uid ?? '0',
    displayName: s?.displayName ?? '—',
    username: s?.username,
  };
}

function mapRow(raw: RedemptionDtoRaw): RedemptionCode {
  const maxRedemptions = raw.maxRedemptions ?? raw.count ?? 1;
  const redeemedCount = raw.redeemedCount ?? (raw.status === 2 && maxRedemptions <= 1 ? 1 : 0);
  const claims = mapClaims(raw);
  const account = mapAccount(raw);
  const redeemedTime = wireEpochToMillis(raw.redeemedTime ?? null);
  const createdTime = wireEpochToMillis(raw.createdTime) ?? 0;
  const expiredTime = wireEpochToMillis(raw.expiredTime ?? null);
  return {
    id: raw.id,
    name: raw.name,
    key: raw.key,
    status: mapStatus(raw.status),
    quota: raw.quota,
    maxRedemptions: Math.max(1, maxRedemptions),
    redeemedCount: Math.max(0, redeemedCount),
    createdTime,
    redeemedTime,
    account,
    claims:
      claims.length > 0
        ? claims
        : account && redeemedTime
          ? [{ account, redeemedTime }]
          : [],
    createdBy: mapCreatedBy(raw),
    expiredTime,
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
    const expiredMs = input.expiredAtUtc ? Date.parse(input.expiredAtUtc) : null;
    const result = await requestDemuxAi<CreateRedemptionsResponseRaw>(BASE, {
      method: 'POST',
      body: {
        name: input.name.trim(),
        quota: displayAmountToQuota(input.amount),
        count: input.count,
        maxRedemptions: input.maxRedemptions,
        expiredTime: expiredMs && expiredMs > 0 ? expiredMs : -1,
      },
    });
    if (!result.success) return result;
    return { success: true, data: { keys: result.data.keys ?? [] } };
  }

  async remove(id: number): Promise<AppResult<void>> {
    return requestDemuxAi<void>(`${BASE}/${id}`, { method: 'DELETE' });
  }

  async stats(): Promise<AppResult<RedemptionStats>> {
    const result = await requestDemuxAi<{
      total?: number;
      claimable?: number;
      inProgress?: number;
      exhausted?: number;
      expired?: number;
    }>(`${BASE}/stats`);
    if (!result.success) return result;
    return {
      success: true,
      data: {
        total: result.data.total ?? 0,
        claimable: result.data.claimable ?? 0,
        inProgress: result.data.inProgress ?? 0,
        exhausted: result.data.exhausted ?? 0,
        expired: result.data.expired ?? 0,
      },
    };
  }
}

export function redemptionQuotaToYuan(quota: number): number {
  return quotaToDisplayAmount(quota);
}
