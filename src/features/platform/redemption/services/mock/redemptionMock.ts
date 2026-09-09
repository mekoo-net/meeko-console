import { fail, ok, type AppResult } from '@/shared/api/httpTypes';
import { delay } from '@/shared/lib/delay';

import type {
  CreateRedemptionsInput,
  ListRedemptionsFilter,
  Redemption,
} from '../../model/redemption.types';
import type { ListRedemptionsPage, RedemptionPort } from '../ports/redemptionPort';

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

function randomKey(): string {
  let s = '';
  for (let i = 0; i < 20; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return s;
}

let nextId = 1;
const now = Date.now();

const rows: Redemption[] = [
  { id: String(nextId++), name: '新用户体验金', keyMasked: 'a3F9****', status: 'unused', quota: 10, maxRedemptions: 500, redeemedCount: 137, usedByAccountUid: '10001', createdAtUtc: now - 86_400_000 * 6, redeemedAtUtc: now - 3_600_000, expiresAtUtc: now + 86_400_000 * 24 },
  { id: String(nextId++), name: '内测补偿', keyMasked: 'Qm2x****', status: 'used', quota: 50, maxRedemptions: 1, redeemedCount: 1, usedByAccountUid: '10042', createdAtUtc: now - 86_400_000 * 3, redeemedAtUtc: now - 86_400_000, expiresAtUtc: null },
  { id: String(nextId++), name: '内测补偿', keyMasked: 'zP7k****', status: 'unused', quota: 50, maxRedemptions: 1, redeemedCount: 0, usedByAccountUid: null, createdAtUtc: now - 86_400_000 * 3, redeemedAtUtc: null, expiresAtUtc: null },
  { id: String(nextId++), name: '过期活动', keyMasked: 'H1uu****', status: 'expired', quota: 5, maxRedemptions: 100, redeemedCount: 12, usedByAccountUid: null, createdAtUtc: now - 86_400_000 * 40, redeemedAtUtc: null, expiresAtUtc: now - 86_400_000 * 10 },
];

export class RedemptionMock implements RedemptionPort {
  async list(input: {
    page: number;
    pageSize: number;
    filter: ListRedemptionsFilter;
  }): Promise<AppResult<ListRedemptionsPage>> {
    await delay(120);
    const kw = input.filter.keyword?.trim().toLowerCase();
    const filtered = rows
      .filter((r) => (kw ? r.name.toLowerCase().includes(kw) || r.keyMasked.toLowerCase().includes(kw) : true))
      .filter((r) => (input.filter.status && input.filter.status !== 'all' ? r.status === input.filter.status : true))
      .sort((a, b) => b.createdAtUtc - a.createdAtUtc);
    const start = (input.page - 1) * input.pageSize;
    return ok({ items: filtered.slice(start, start + input.pageSize).map((r) => ({ ...r })), total: filtered.length });
  }

  async create(input: CreateRedemptionsInput): Promise<AppResult<{ keys: string[] }>> {
    await delay(200);
    if (!input.name.trim()) return fail({ code: 'validation', message: '名称必填' });
    if (input.quota <= 0) return fail({ code: 'validation', message: '面额必须大于 0' });
    const keys: string[] = [];
    for (let i = 0; i < Math.max(1, input.count); i++) {
      const key = randomKey();
      keys.push(key);
      rows.push({
        id: String(nextId++),
        name: input.name.trim(),
        keyMasked: `${key.slice(0, 4)}****`,
        status: 'unused',
        quota: input.quota,
        maxRedemptions: Math.max(1, input.maxRedemptions),
        redeemedCount: 0,
        usedByAccountUid: null,
        createdAtUtc: Date.now(),
        redeemedAtUtc: null,
        expiresAtUtc: input.expiresAtUtc,
      });
    }
    return ok({ keys });
  }

  async disable(id: string): Promise<AppResult<void>> {
    await delay(100);
    const r = rows.find((x) => x.id === id);
    if (!r) return fail({ code: 'not_found', message: '兑换码不存在' });
    r.status = 'disabled';
    return ok(undefined);
  }
}
