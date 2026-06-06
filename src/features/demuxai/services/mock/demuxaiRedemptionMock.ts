import { fail, ok, type AppResult } from '@/shared/api/httpTypes';
import { clientPaginate } from '@/shared/composables/usePagination';
import { delay } from '@/shared/lib/delay';
import { displayAmountToQuota } from '@/shared/lib/quota';
import { useAuthStore } from '@/stores/auth';

import { computeRedemptionStats } from '../../model/redemptionDisplay';
import { isSharedRedemptionCode } from '../../model/redemption.types';
import type {
  CreateRedemptionCodesInput,
  CreateRedemptionCodesResult,
  ListRedemptionCodesFilter,
  RedemptionCode,
  RedemptionStaff,
} from '../../model/redemption.types';
import type {
  DemuxaiRedemptionPort,
  ListRedemptionCodesPage,
} from '../ports/demuxaiRedemptionPort';
import { buildRedemptionSeed, MOCK_STAFF_ADMIN } from './demuxaiRedemptionMockData';

function currentStaff(): RedemptionStaff {
  try {
    const u = useAuthStore().session?.iamUser;
    if (u) {
      return { uid: u.uid, displayName: u.displayName, username: u.username };
    }
  } catch {
    /* pinia 未就绪 */
  }
  return MOCK_STAFF_ADMIN;
}

function randomKey(): string {
  const seg = () => Math.random().toString(36).slice(2, 6).toUpperCase();
  return `CDK-${seg()}-${seg()}-${seg()}`;
}

function parseExpiredMs(iso: string | null): number | null {
  if (!iso?.trim()) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

let store: RedemptionCode[] | null = null;
let nextId = 3000;

function ensureStore(): RedemptionCode[] {
  if (!store) store = buildRedemptionSeed();
  return store;
}

function matchesFilter(row: RedemptionCode, filter: ListRedemptionCodesFilter): boolean {
  if (filter.kind === 'shared' && !isSharedRedemptionCode(row)) return false;
  if (filter.kind === 'single' && isSharedRedemptionCode(row)) return false;
  if (filter.status && filter.status !== 'all' && row.status !== filter.status) return false;
  const kw = filter.keyword?.trim().toLowerCase();
  if (!kw) return true;
  const by = row.createdBy;
  return (
    row.name.toLowerCase().includes(kw) ||
    row.key.toLowerCase().includes(kw) ||
    by.displayName.toLowerCase().includes(kw) ||
    (by.username?.toLowerCase().includes(kw) ?? false)
  );
}

export class DemuxaiRedemptionMock implements DemuxaiRedemptionPort {
  async list(input: {
    page: number;
    pageSize: number;
    filter: ListRedemptionCodesFilter;
  }): Promise<AppResult<ListRedemptionCodesPage>> {
    await delay();
    const filtered = ensureStore().filter((r) => matchesFilter(r, input.filter));
    const items = clientPaginate(filtered, input.page, input.pageSize);
    return ok({ items, total: filtered.length });
  }

  async create(input: CreateRedemptionCodesInput): Promise<AppResult<CreateRedemptionCodesResult>> {
    await delay(400);
    const name = input.name.trim();
    if (!name) return fail({ code: 'validation', message: '名称不能为空' });
    if (!Number.isFinite(input.amount) || input.amount <= 0) {
      return fail({ code: 'validation', message: '单张额度须大于 0' });
    }
    const maxRedemptions = Math.min(Math.max(Math.floor(input.maxRedemptions), 1), 10_000);
    const count =
      maxRedemptions > 1
        ? 1
        : Math.min(Math.max(Math.floor(input.count), 1), 100);
    const quota = displayAmountToQuota(input.amount);
    const expiredTime = parseExpiredMs(input.expiredAtUtc);
    const keys: string[] = [];
    const now = Date.now();
    for (let i = 0; i < count; i++) {
      const key = randomKey();
      keys.push(key);
      ensureStore().unshift({
        id: nextId++,
        name,
        key,
        status: 1,
        quota,
        maxRedemptions,
        redeemedCount: 0,
        createdTime: now,
        redeemedTime: null,
        account: null,
        claims: [],
        createdBy: currentStaff(),
        expiredTime,
      });
    }
    return ok({ keys });
  }

  async remove(id: number): Promise<AppResult<void>> {
    await delay(300);
    const data = ensureStore();
    const row = data.find((r) => r.id === id);
    if (!row) return fail({ code: 'not_found', message: '激活码不存在' });
    if (row.redeemedCount > 0) {
      return fail({ code: 'validation', message: '已有领取记录的激活码不可删除' });
    }
    store = data.filter((r) => r.id !== id);
    return ok(undefined);
  }

  async stats(): Promise<AppResult<import('../../model/redemptionDisplay').RedemptionStats>> {
    await delay();
    return ok(computeRedemptionStats(ensureStore()));
  }
}
