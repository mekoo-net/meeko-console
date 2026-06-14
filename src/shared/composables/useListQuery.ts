import { watch, type Ref } from 'vue';

import type { AppResult } from '@/shared/api/httpTypes';

import { useAsyncState } from './useAsyncState';
import { usePagination } from './usePagination';

/**
 * 列表查询统一封装：管理 page/size/total + filter，并触发 fetcher。
 *
 * - `filterKey` 是 filter 变化的稳定签名；变化时回到第一页。
 * - `fetcher` 返回标准 `AppResult<{ items, total }>`，由调用方完成 mock 端的分页/筛选。
 */
export interface ListPage<T> {
  items: T[];
  total: number;
}

export interface UseListQueryOptions<T, F> {
  filterKey: () => string;
  fetcher(input: { page: number; pageSize: number; filter: F }): Promise<AppResult<ListPage<T>>>;
  /** 当前 filter 的引用，fetcher 中通过 input.filter 拿到（避免 fetcher 依赖闭包）。 */
  filter: Ref<F>;
  /** 创建时是否立即拉取一次（默认 true）。filter 静态的列表页依赖它完成首屏加载。 */
  immediate?: boolean;
  pageSize?: number;
}

export function useListQuery<T, F>(opts: UseListQueryOptions<T, F>) {
  const pagination = usePagination({ pageSize: opts.pageSize ?? 20 });

  const fetch = async (): Promise<AppResult<ListPage<T>>> => {
    return opts.fetcher({
      page: pagination.state.page,
      pageSize: pagination.state.pageSize,
      filter: opts.filter.value,
    });
  };

  const state = useAsyncState<ListPage<T>, []>(fetch, {
    initial: { items: [], total: 0 },
    onSuccess: (page) => pagination.setTotal(page.total),
  });

  // 翻页 / 换页大小：直接 refetch。
  watch(
    () => [pagination.state.page, pagination.state.pageSize],
    () => {
      void state.run();
    },
  );

  // filter 签名变化：回首页并 refetch。
  watch(
    () => opts.filterKey(),
    () => {
      if (pagination.state.page === 1) {
        void state.run();
      } else {
        pagination.setPage(1);
      }
    },
  );

  const refresh = () => state.run();

  // 首屏加载：filter 与分页在挂载时都不会变化，watcher 不会触发，需主动拉取一次。
  if (opts.immediate !== false) {
    void state.run();
  }

  return {
    pagination,
    items: state.data,
    error: state.error,
    loading: state.loading,
    refresh,
  };
}
