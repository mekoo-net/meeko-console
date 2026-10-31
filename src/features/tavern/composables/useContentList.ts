import { ref } from 'vue';
import { useRoute } from 'vue-router';

import type { ItemsEnvelope } from '@/features/tavern/api/http';
import { fail, type AppResult } from '@/shared/api/httpTypes';

import type { ContentQuery, LifecycleState, PageQuery } from '../model/content.types';
import { parseAccountUid } from '../model/meteringFormat';
import { usePagedList } from './usePagedList';

/** 筛选栏上的原样输入；账户 UID 是文本框，提交前才校验。 */
interface ContentFilter {
  accountUid: string;
  keyword: string;
  state: LifecycleState;
}

const blank = (): ContentFilter => ({ accountUid: '', keyword: '', state: 'live' });

/**
 * 世界、角色卡两张列表同一套筛选：账户（可以从账户页带 `?uid=` 过来）、关键字、生命周期，默认只列没删的。
 */
export function useContentList<T>(fetch: (query: ContentQuery, page: PageQuery) => Promise<AppResult<ItemsEnvelope<T>>>) {
  const route = useRoute();
  const filter = ref<ContentFilter>({ ...blank(), accountUid: typeof route.query.uid === 'string' ? route.query.uid : '' });

  const list = usePagedList<T>(async (page) => {
    const { accountUid, keyword, state } = filter.value;
    const uid = parseAccountUid(accountUid);
    return uid.ok
      ? fetch({ accountUid: uid.value, keyword: keyword.trim() || undefined, state }, page)
      : fail({ code: 'validation', message: '账户 UID 只能是数字' });
  }, filter);

  function reset(): void {
    filter.value = blank();
  }

  return { ...list, filter, reset };
}
