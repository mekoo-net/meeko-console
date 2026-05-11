import { computed, reactive, type Ref, ref, watch } from 'vue';

/**
 * 受控分页 + 总数。视图通过 `setTotal` 同步后端返回的总条数；翻页/换页大小走 mutator。
 *
 * - 严格类型，不暴露 page/size 之外的字段。
 * - 切换 pageSize 时回到第 1 页（业界惯例）。
 * - 支持外部强制重置（filter 变化时调用 reset()）。
 */
export interface PaginationOptions {
  initialPage?: number;
  initialPageSize?: number;
  pageSizes?: number[];
}

export interface PaginationState {
  page: number;
  pageSize: number;
  total: number;
}

export function usePagination(opts: PaginationOptions = {}) {
  const initialPage = opts.initialPage ?? 1;
  const initialPageSize = opts.initialPageSize ?? 20;
  const pageSizes = opts.pageSizes ?? [10, 20, 50, 100];

  const state = reactive<PaginationState>({
    page: initialPage,
    pageSize: initialPageSize,
    total: 0,
  });

  const totalPages = computed(() => {
    if (state.total <= 0) return 1;
    return Math.max(1, Math.ceil(state.total / state.pageSize));
  });

  const setPage = (p: number): void => {
    const clamped = Math.min(Math.max(1, Math.floor(p)), totalPages.value);
    state.page = clamped;
  };

  const setPageSize = (size: number): void => {
    if (size <= 0 || !Number.isFinite(size)) return;
    state.pageSize = Math.floor(size);
    state.page = 1;
  };

  const setTotal = (total: number): void => {
    state.total = Math.max(0, Math.floor(total));
    if (state.page > totalPages.value) state.page = totalPages.value;
  };

  const reset = (): void => {
    state.page = initialPage;
    state.total = 0;
  };

  return {
    state,
    totalPages,
    pageSizes,
    setPage,
    setPageSize,
    setTotal,
    reset,
  };
}

/**
 * 把页码/页大小变化映射成 fetcher 调用。`deps` 中的引用变化会触发 reset + fetch；
 * 视图层只关心 `loading/error/items/refresh`。
 */
export function watchPagination(
  page: Ref<number>,
  pageSize: Ref<number>,
  fetcher: () => void | Promise<void>,
): void {
  watch([page, pageSize], () => {
    void fetcher();
  });
}

/** 客户端兜底分页：纯函数，给 mock / 前端 filter 用。 */
export function clientPaginate<T>(items: readonly T[], page: number, pageSize: number): T[] {
  if (pageSize <= 0) return [];
  const start = Math.max(0, (page - 1) * pageSize);
  return items.slice(start, start + pageSize);
}

// re-export 一个简易 ref helper，避免使用方写很多样板
export function refValue<T>(initial: T): Ref<T> {
  return ref(initial) as Ref<T>;
}
