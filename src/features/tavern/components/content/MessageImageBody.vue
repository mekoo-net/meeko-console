<script setup lang="ts">
/**
 * 图片消息：库里只有对象存储的键，不是能直接打开的地址，原样露出来给员工去存储页查。
 */
import { computed } from 'vue';

import type { ImageBody } from '../../model/content.types';

const props = defineProps<{ body: ImageBody }>();

const size = computed(() => {
  const { width, height } = props.body.image;
  return width == null && height == null ? '' : ` (${width ?? '?'}×${height ?? '?'})`;
});
</script>

<template>
  <div class="msg-image">
    [图片] <span class="mono">{{ body.image.storageKey }}</span>{{ size }}
  </div>
</template>

<style scoped>
.msg-image {
  color: var(--el-text-color-regular);
  word-break: break-all;
}

.mono {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
}
</style>
