<script setup lang="ts">
import { computed } from 'vue';

import { resolveChannel } from '../model/channel.types';

const props = defineProps<{ vendorKey: string }>();

const channel = computed(() => resolveChannel(props.vendorKey));

const toneClass = computed(() => {
  switch (channel.value?.id) {
    case 'cursor':
      return 'channel-tag--cursor';
    case 'kiro':
      return 'channel-tag--kiro';
    case 'antigravity':
      return 'channel-tag--antigravity';
    case 'claude-code':
      return 'channel-tag--claude';
    case 'codex':
      return 'channel-tag--codex';
    default:
      return 'channel-tag--custom';
  }
});
</script>

<template>
  <span
    class="channel-tag"
    :class="toneClass"
  >
    {{ channel?.name ?? '自定义' }}
  </span>
</template>

<style scoped>
.channel-tag {
  display: inline-flex;
  align-items: center;
  padding: 1px 8px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.6;
}
.channel-tag--cursor {
  background: #fef3c7;
  color: #92400e;
}
.channel-tag--kiro {
  background: #d1fae5;
  color: #065f46;
}
.channel-tag--antigravity {
  background: #ede9fe;
  color: #5b21b6;
}
.channel-tag--claude {
  background: #ffedd5;
  color: #9a3412;
}
.channel-tag--codex {
  background: #e0f2fe;
  color: #075985;
}
.channel-tag--custom {
  background: var(--el-fill-color);
  color: var(--el-text-color-secondary);
}
</style>
