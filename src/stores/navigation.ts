import { ref } from 'vue';
import { defineStore } from 'pinia';

/**
 * 路由切换 pending：lazy chunk 下载期间在内容区展示与表格相同的 v-loading。
 * chunk 就绪后尽快交给各页自己的 loading（表格 / DataTableShell）。
 */
export const useNavigationStore = defineStore('navigation', () => {
  const pending = ref(false);
  let finishChain: Promise<void> = Promise.resolve();

  function start(): void {
    pending.value = true;
  }

  function finish(): Promise<void> {
    finishChain = finishChain.then(async () => {
      pending.value = false;
    });
    return finishChain;
  }

  function reset(): void {
    pending.value = false;
  }

  return { pending, start, finish, reset };
});
