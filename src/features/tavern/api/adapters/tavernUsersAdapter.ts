import { parseTavern, requestTavern, type ItemsEnvelope } from '@/features/tavern/api/http';
import type { TavernUsersPort } from '@/features/tavern/services/ports/tavernUsersPort';
import type { AppResult } from '@/shared/api/httpTypes';

import type { PageQuery } from '../../model/content.types';
import { pageSchema } from '../../model/metering.types';
import {
  tavernUserDetailSchema,
  tavernUserSchema,
  type TavernUser,
  type TavernUserDetail,
  type UserQuery,
} from '../../model/users.types';

const BASE = '/tavern/api/admin/users';

const userPageSchema = pageSchema(tavernUserSchema);

export class TavernUsersHttpAdapter implements TavernUsersPort {
  async list(query: UserQuery, page: PageQuery): Promise<AppResult<ItemsEnvelope<TavernUser>>> {
    return parseTavern(userPageSchema, await requestTavern<unknown>(BASE, { query: { ...page, ...query } }), '用户列表');
  }

  async get(uid: number): Promise<AppResult<TavernUserDetail>> {
    return parseTavern(tavernUserDetailSchema, await requestTavern<unknown>(`${BASE}/${uid}`), '用户');
  }
}
