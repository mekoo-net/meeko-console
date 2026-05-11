import { ref, type Ref, shallowRef } from 'vue';

import type { AppError, AppResult } from '@/shared/api/httpTypes';

/**
 * 三态 loading/error/data 容器，配合返回 `AppResult<T>` 的 service port 使用。
 *
 * 设计要点：
 * - error 与 data 互斥：成功后 error 清空；失败保留上一次 data，避免列表闪空。
 * - run() 返回 Result，调用方可以 chain 后续动作（如关闭抽屉、跳页）。
 * - 不允许把异常向上抛：任何来自 port 的拒绝都被转成 AppFail。
 */
export interface UseAsyncStateOptions<T> {
  initial?: T;
  /** 调用前是否清空 data（默认 false，保留旧数据，列表场景友好）。 */
  resetOnRun?: boolean;
  onSuccess?(data: T): void;
  onError?(error: AppError): void;
}

export interface UseAsyncState<T, TArgs extends readonly unknown[]> {
  data: Ref<T | undefined>;
  error: Ref<AppError | undefined>;
  loading: Ref<boolean>;
  run(...args: TArgs): Promise<AppResult<T>>;
}

export function useAsyncState<T, TArgs extends readonly unknown[]>(
  task: (...args: TArgs) => Promise<AppResult<T>>,
  options: UseAsyncStateOptions<T> = {},
): UseAsyncState<T, TArgs> {
  const data = shallowRef<T | undefined>(options.initial);
  const error = ref<AppError | undefined>();
  const loading = ref(false);

  const run = async (...args: TArgs): Promise<AppResult<T>> => {
    loading.value = true;
    if (options.resetOnRun) data.value = options.initial;
    error.value = undefined;
    try {
      const result = await task(...args);
      if (result.success) {
        data.value = result.data;
        options.onSuccess?.(result.data);
      } else {
        error.value = result.error;
        options.onError?.(result.error);
      }
      return result;
    } finally {
      loading.value = false;
    }
  };

  return { data, error, loading, run };
}
