<script setup lang="ts">
import { computed } from 'vue';

import { makerLabel } from '@yomi/common';

import { makerIconSrc } from '../model/makerIcons';

interface Props {
  maker: string;
}

const props = defineProps<Props>();

const src = computed(() => makerIconSrc(props.maker));
const label = computed(() => makerLabel(props.maker));
</script>

<template>
  <span class="maker-mark">
    <img :src="src" :alt="label" />
  </span>
</template>

<style scoped>
.maker-mark {
  flex-shrink: 0;
  align-self: center;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  background: var(--el-fill-color-light);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  line-height: 0;
}
.maker-mark img {
  display: block;
  width: 20px;
  height: 20px;
  object-fit: contain;
}
</style>
