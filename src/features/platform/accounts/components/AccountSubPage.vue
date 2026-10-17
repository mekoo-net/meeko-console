<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';

/** 账户详情里带二级页的标签（账单、返利）：顶部分段切换，下面渲染子路由。 */
const props = defineProps<{
  /** 一级标签的路由段，如 billing。 */
  section: string;
  options: ReadonlyArray<{ label: string; value: string }>;
}>();

const route = useRoute();
const router = useRouter();

const active = computed(() => route.path.split('/')[4] ?? props.options[0]?.value ?? '');

function go(value: string | number | boolean): void {
  if (value === active.value) return;
  void router.push(`/accounts/${String(route.params.uid)}/${props.section}/${String(value)}`);
}
</script>

<template>
  <div class="account-subpage">
    <el-segmented
      :model-value="active"
      :options="[...options]"
      class="account-subpage__nav"
      @change="go"
    />
    <div class="account-subpage__body">
      <router-view />
    </div>
  </div>
</template>

<style scoped>
.account-subpage {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-height: 0;
}
.account-subpage__nav {
  align-self: flex-start;
}
.account-subpage__body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
</style>
