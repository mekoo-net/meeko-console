<script setup lang="ts">
/**
 * 文档里网关读不懂的地方，两页都挂在顶上：任何一处读不懂，整份都存不进去，所以在哪一页都得看得见。
 */
import type { FilterProblem } from '../../model/filter.types';

defineProps<{ problems: readonly FilterProblem[] }>();
</script>

<template>
  <el-alert
    v-if="problems.length > 0"
    type="error"
    :closable="false"
    show-icon
    class="filter-problems"
    data-test="doc-problems"
  >
    <template #title>
      网关读不懂这份安全策略的 {{ problems.length }} 处：读不懂的分类器不生效，读不懂的过滤器整个不生效（那个 Vendor
      什么都收）；改好以前整份存不进去。
    </template>
    <ul class="filter-problems__list">
      <li
        v-for="(p, i) in problems"
        :key="i"
      >
        <code>{{ p.subject }}</code>：{{ p.reason }}
      </li>
    </ul>
  </el-alert>
</template>

<style scoped>
.filter-problems {
  margin-bottom: 12px;
}
.filter-problems__list {
  margin: 4px 0 0;
  padding-left: 18px;
  line-height: 1.6;
}
</style>
