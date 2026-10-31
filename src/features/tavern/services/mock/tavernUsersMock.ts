import type { ItemsEnvelope } from '@/features/tavern/api/http';
import { fail, ok, type AppResult } from '@/shared/api/httpTypes';
import { delay } from '@/shared/lib/delay';

import type { PageQuery } from '../../model/content.types';
import type { TavernUser, TavernUserDetail, UserContentStats, UserMarketStats, UserQuery } from '../../model/users.types';
import type { TavernUsersPort } from '../ports/tavernUsersPort';
import { ASAKO, LINXIA, PLAYER_0123 } from './tavernMockAccounts';
import { pageOf } from './tavernMeteringMockData';

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const NOW = Date.now();

interface MockUser {
  user: TavernUser;
  content: UserContentStats;
  market: UserMarketStats;
}

/** 与内容 mock 对得上：林夏两个世界、三张卡，0123 一张卡（另一张卡和一个世界删了），麻子刚进来什么都没有。 */
const users: MockUser[] = [
  {
    user: { account: LINXIA, credits: { available: 1834.5, held: 12.4 }, joinedAt: NOW - 45 * DAY, lastSeenAt: NOW - 8 * MINUTE },
    content: { worlds: 2, cards: 3 },
    market: { purchased: 2, published: 0 },
  },
  {
    user: { account: PLAYER_0123, credits: { available: 96.2, held: 0 }, joinedAt: NOW - 31 * DAY, lastSeenAt: NOW - 2 * DAY },
    content: { worlds: 0, cards: 1 },
    market: { purchased: 1, published: 1 },
  },
  {
    user: { account: ASAKO, credits: { available: 0, held: 0 }, joinedAt: NOW - 3 * 60 * MINUTE, lastSeenAt: NOW - 3 * 60 * MINUTE },
    content: { worlds: 0, cards: 0 },
    market: { purchased: 0, published: 2 },
  },
];

function matches(u: TavernUser, keyword: string): boolean {
  return [u.account.displayName, u.account.email, u.account.phone].some((v) => v?.toLowerCase().includes(keyword));
}

export class TavernUsersMock implements TavernUsersPort {
  async list(query: UserQuery, page: PageQuery): Promise<AppResult<ItemsEnvelope<TavernUser>>> {
    await delay();
    const keyword = query.keyword?.trim().toLowerCase();
    const rows = users
      .map((u) => u.user)
      .filter((u) => query.uid == null || u.account.uid === query.uid)
      .filter((u) => !keyword || matches(u, keyword))
      .sort((a, b) => b.lastSeenAt - a.lastSeenAt);
    return ok(pageOf(rows, page.p, page.pageSize));
  }

  async get(uid: number): Promise<AppResult<TavernUserDetail>> {
    await delay();
    const u = users.find((x) => x.user.account.uid === uid);
    return u ? ok({ user: u.user, content: u.content, market: u.market }) : fail({ code: 'not_found', message: '这个账户没进过 Tavern。' });
  }
}
