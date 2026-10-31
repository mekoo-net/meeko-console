import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ok } from '@/shared/api/httpTypes';
import * as http from '@/features/tavern/api/http';

import { TavernUsersHttpAdapter } from '../api/adapters/tavernUsersAdapter';

// 只替换传输，parseTavern 用真的：解析正是要测的东西。
vi.mock('@/features/tavern/api/http', async (importOriginal) => ({
  ...(await importOriginal<typeof http>()),
  requestTavern: vi.fn(),
}));

const request = vi.mocked(http.requestTavern);

const ACCOUNT = { uid: 100002333, displayName: '林夏', email: 'linxia@example.com', phone: null };
const USER = { account: ACCOUNT, credits: { available: 1834.5, held: 12.4 }, joinedAt: 1758600000000, lastSeenAt: 1761877649000 };

describe('TavernUsersHttpAdapter', () => {
  beforeEach(() => request.mockReset());

  it('lists users with the uid and keyword the filter gave', async () => {
    request.mockResolvedValueOnce(ok({ items: [USER], total: 1, page: 1, pageSize: 20 }));
    const r = await new TavernUsersHttpAdapter().list({ keyword: '林' }, { p: 1, pageSize: 20 });
    expect(request).toHaveBeenCalledWith('/tavern/api/admin/users', { query: { p: 1, pageSize: 20, keyword: '林' } });
    expect(r.success && r.data.items[0]?.credits.held).toBe(12.4);
  });

  it('reads the header, and keeps going when WorldLine had no counts', async () => {
    request.mockResolvedValueOnce(ok({ user: USER, content: null, market: { purchased: 2, published: 0 } }));
    const r = await new TavernUsersHttpAdapter().get(100002333);
    expect(request).toHaveBeenCalledWith('/tavern/api/admin/users/100002333');
    expect(r.success && r.data.content).toBeNull();
    expect(r.success && r.data.market.purchased).toBe(2);
  });
});
