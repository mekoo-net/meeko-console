import { ref } from 'vue';

import type { ItemsEnvelope } from '@/features/tavern/api/http';
import type { AppResult } from '@/shared/api/httpTypes';

import type { ContentQuery, LifecycleState, PageQuery } from '../model/content.types';
import { usePagedList } from './usePagedList';

interface ContentFilter {
  keyword: string;
  state: LifecycleState;
}

const blank = (): ContentFilter => ({ keyword: '', state: 'live' });

/**
 * 用户视角里世界线、联系人两张表同一套筛选：关键字、生命周期，默认只列没删的。
 * 账户是定的——就是正在看的这个用户。
 */
export function useContentList<T>(
  accountUid: number,
  fetch: (query: ContentQuery, page: PageQuery) => Promise<AppResult<ItemsEnvelope<T>>>,
) {
  const filter = ref<ContentFilter>(blank());

  const list = usePagedList<T>(
    (page) => fetch({ accountUid, keyword: filter.value.keyword.trim() || undefined, state: filter.value.state }, page),
    filter,
  );

  function reset(): void {
    filter.value = blank();
  }

  return { ...list, filter, reset };
}
