<script setup lang="ts">
/**
 * 渠道页的左栏：渠道列表。样式用左右分栏页共用的那一套（workspace.css，由外层的 WorkspaceLayout 带进来），
 * 和 Yomi 的渠道页是一个样子；内容是 Jastalk 自己的（在线、倍率、未定价），所以单写一份，不拿 Yomi 的侧栏来改。
 */
import { computed, ref } from 'vue';
import { Search } from '@element-plus/icons-vue';

import EmptyState from '@/shared/ui/EmptyState.vue';
import StatusTag from '@/shared/ui/StatusTag.vue';

import { multiplierText } from '../../model/channelPricing';
import type { Channel } from '../../model/jastalk.types';

const props = defineProps<{
  channels: Channel[];
  /** 选中的渠道键。 */
  modelValue: string;
  /** false = 这次没读到 OneApi 的渠道目录：在线不在线不知道，不能都标成离线。 */
  upstreamReachable: boolean;
  loading?: boolean;
}>();

const emit = defineEmits<{ (e: 'update:modelValue', v: string): void }>();

const keyword = ref('');

const shown = computed(() => {
  const kw = keyword.value.trim().toLowerCase();
  if (!kw) return props.channels;
  return props.channels.filter((c) => c.vendorKey.toLowerCase().includes(kw) || c.vendorName.toLowerCase().includes(kw));
});

function status(c: Channel): { label: string; tone: 'success' | 'info' | 'warning' } {
  if (!props.upstreamReachable) return { label: '未知', tone: 'warning' };
  return c.online ? { label: '在线', tone: 'success' } : { label: '离线', tone: 'info' };
}
</script>

<template>
  <aside
    v-loading="loading"
    class="provider-sidebar"
  >
    <div class="provider-sidebar__toolbar">
      <el-input
        v-model="keyword"
        :prefix-icon="Search"
        placeholder="搜索渠道"
        clearable
        size="small"
      />
    </div>

    <div
      v-if="shown.length > 0"
      class="provider-sidebar__list"
    >
      <button
        v-for="c in shown"
        :key="c.vendorKey"
        type="button"
        class="provider-sidebar__item"
        :class="{ 'provider-sidebar__item--active': modelValue === c.vendorKey }"
        @click="emit('update:modelValue', c.vendorKey)"
      >
        <div class="provider-sidebar__item-head">
          <span class="provider-sidebar__item-title">{{ c.vendorName }}</span>
          <div class="provider-sidebar__item-actions">
            <StatusTag
              :label="status(c).label"
              :tone="status(c).tone"
            />
          </div>
        </div>
        <span class="provider-sidebar__item-qg">{{ c.vendorKey }}</span>
        <div class="provider-sidebar__item-meta">
          <span
            v-if="c.multiplier !== null"
            class="channel-mult"
          >{{ multiplierText(c.multiplier) }}</span>
          <el-tag
            v-else
            size="small"
            type="warning"
            effect="plain"
            round
          >
            未设倍率
          </el-tag>
          <span>{{ c.models }} 个模型</span>
          <el-tag
            v-if="c.unpriced > 0"
            size="small"
            type="danger"
            effect="plain"
            round
          >
            未定价 {{ c.unpriced }}
          </el-tag>
        </div>
      </button>
    </div>

    <EmptyState
      v-else-if="channels.length === 0"
      title="还没有渠道"
      class="provider-sidebar__empty"
    />
    <div
      v-else
      class="provider-sidebar__no-match"
    >
      没有匹配的渠道
    </div>
  </aside>
</template>

<style scoped>
.channel-mult {
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--el-text-color-primary);
}
</style>
