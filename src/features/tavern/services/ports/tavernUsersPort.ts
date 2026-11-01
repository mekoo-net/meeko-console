import type { ItemsEnvelope } from '@/features/tavern/api/http';
import type { AppResult } from '@/shared/api/httpTypes';

import type { PageQuery } from '../../model/content.types';
import type { TavernUser, TavernUserDetail, UserCardQuery, UserCardRow, UserQuery } from '../../model/users.types';

/** Tavern 的玩家：列表按最近活跃倒序；进入一个玩家看他的头部、他手里的卡。 */
export interface TavernUsersPort {
  list(query: UserQuery, page: PageQuery): Promise<AppResult<ItemsEnvelope<TavernUser>>>;
  get(uid: number): Promise<AppResult<TavernUserDetail>>;
  /** 用户视角「卡片」：手里的卡（自己做的、买来的），新得的在前。卡和权益归工坊，在售状态归市场，服务端拼好。 */
  cards(uid: number, query: UserCardQuery, page: PageQuery): Promise<AppResult<ItemsEnvelope<UserCardRow>>>;
}
