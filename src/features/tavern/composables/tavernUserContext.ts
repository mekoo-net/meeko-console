import type { InjectionKey, Ref } from 'vue';

import type { TavernUserDetail } from '../model/users.types';

/** 用户视角的头部：标签页里改了会进头部统计的东西（发放积分）就让它重拉。 */
export interface TavernUserContext {
  detail: Ref<TavernUserDetail | null>;
  refresh: () => void;
}

export const TavernUserKey: InjectionKey<TavernUserContext> = Symbol('TavernUser');
