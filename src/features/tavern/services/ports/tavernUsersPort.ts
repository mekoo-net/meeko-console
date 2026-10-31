import type { ItemsEnvelope } from '@/features/tavern/api/http';
import type { AppResult } from '@/shared/api/httpTypes';

import type { PageQuery } from '../../model/content.types';
import type { TavernUser, TavernUserDetail, UserQuery } from '../../model/users.types';

/** Tavern 的玩家：列表按最近活跃倒序；进入一个玩家看他的头部。 */
export interface TavernUsersPort {
  list(query: UserQuery, page: PageQuery): Promise<AppResult<ItemsEnvelope<TavernUser>>>;
  get(uid: number): Promise<AppResult<TavernUserDetail>>;
}
