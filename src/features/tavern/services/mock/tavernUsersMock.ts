import type { ItemsEnvelope } from '@/features/tavern/api/http';
import { fail, ok, type AppResult } from '@/shared/api/httpTypes';
import { delay } from '@/shared/lib/delay';

import type { PageQuery } from '../../model/content.types';
import type { OwnedCards, TavernUser, TavernUserDetail, UserCardQuery, UserCardRow, UserContentStats, UserQuery } from '../../model/users.types';
import type { TavernUsersPort } from '../ports/tavernUsersPort';
import { ASAKO, LINXIA, PLAYER_0123 } from './tavernMockAccounts';
import { mockUserCards } from './tavernMarketMock';
import { pageOf } from './tavernMeteringMockData';

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const NOW = Date.now();

interface MockUser {
  user: TavernUser;
  content: UserContentStats;
  /** 上架过几件。 */
  listed: number;
}

/** 与内容 mock、市场 mock 对得上：林夏两个世界、三个联系人，0123 一个联系人（另一个和一个世界删了），麻子刚进来；手里的卡由市场 mock 算。 */
const users: MockUser[] = [
  {
    user: { account: LINXIA, credits: { available: 1834.5, held: 12.4 }, joinedAt: NOW - 45 * DAY, lastSeenAt: NOW - 8 * MINUTE },
    content: { worlds: 2, cards: 3 },
    listed: 1,
  },
  {
    user: { account: PLAYER_0123, credits: { available: 96.2, held: 0 }, joinedAt: NOW - 31 * DAY, lastSeenAt: NOW - 2 * DAY },
    content: { worlds: 0, cards: 1 },
    listed: 1,
  },
  {
    user: { account: ASAKO, credits: { available: 0, held: 0 }, joinedAt: NOW - 3 * 60 * MINUTE, lastSeenAt: NOW - 3 * 60 * MINUTE },
    content: { worlds: 0, cards: 0 },
    listed: 3,
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
    return u
      ? ok({ user: u.user, content: u.content, cards: ownedOf(uid), market: { listed: u.listed } })
      : fail({ code: 'not_found', message: '这个账户没进过 Tavern。' });
  }

  async cards(uid: number, query: UserCardQuery, page: PageQuery): Promise<AppResult<ItemsEnvelope<UserCardRow>>> {
    await delay();
    const rows = mockUserCards(uid)
      .filter((r) => query.kind == null || r.card.kind === query.kind)
      .filter((r) => query.source == null || r.source === query.source);
    return ok(pageOf(rows, page.p, page.pageSize));
  }
}

function ownedOf(uid: number): OwnedCards {
  const cards = mockUserCards(uid);
  return {
    worldCards: cards.filter((c) => c.card.kind === 'world_card').length,
    characterCards: cards.filter((c) => c.card.kind === 'character_card').length,
  };
}
