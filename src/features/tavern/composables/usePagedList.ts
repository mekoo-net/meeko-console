import { ref, shallowRef, watch, type WatchSource } from 'vue';
import { ElMessage } from 'element-plus';

import type { ItemsEnvelope } from '@/features/tavern/api/http';
import type { AppResult } from '@/shared/api/httpTypes';

import type { PageQuery } from '../model/content.types';

/**
 * 服务端分页的列表：翻页、换页大小就重拉；`filter` 变了回第 1 页再拉。
 * 只认最后一次请求的回包，慢的旧请求回来不会盖掉新的；失败弹错误、留着上一页。首屏由调用方 `load()`。
 */
export function usePagedList<T>(fetch: (page: PageQuery) => Promise<AppResult<ItemsEnvelope<T>>>, filter?: WatchSource) {
  const items = shallowRef<T[]>([]);
  const total = ref(0);
  const page = ref(1);
  const pageSize = ref(20);
  const loading = ref(false);
  let seq = 0;

  async function load(): Promise<void> {
    const mine = ++seq;
    loading.value = true;
    try {
      const r = await fetch({ p: page.value, pageSize: pageSize.value });
      if (mine !== seq) return;
      if (r.success) {
        items.value = r.data.items;
        total.value = r.data.total;
      } else {
        ElMessage.error(r.error.message);
      }
    } finally {
      if (mine === seq) loading.value = false;
    }
  }

  /** 从第 1 页重来：已在第 1 页就直接拉，否则改页码，交给翻页那条 watch 拉一次。 */
  function reload(): void {
    if (page.value === 1) void load();
    else page.value = 1;
  }

  watch([page, pageSize], () => void load());
  if (filter) watch(filter, reload, { deep: true });

  return { items, total, page, pageSize, loading, load, reload };
}
