<script setup lang="ts">
/**
 * 生图 / 视频档位多的时候，行里只留「最低–最高 · N 档」，
 * 鼠标悬停再浮出完整档位表，避免把行撑成两三行。
 */
import PricePartMark from './PricePartMark.vue';
import type { PricePart, PricePartKind } from '../../model/priceTable';

interface Props {
  kind: PricePartKind;
  parts: PricePart[];
  compact: { min: string; max: string; count: number };
}

defineProps<Props>();
</script>

<template>
  <el-popover
    trigger="hover"
    placement="bottom-start"
    :show-after="80"
    :hide-after="80"
    :offset="8"
    :width="420"
    popper-class="price-tier-popper"
  >
    <template #reference>
      <button type="button" class="ptiers">
        <span class="ptiers__icon">
          <PricePartMark :kind="kind" :label="`${compact.count} 档`" />
        </span>
        <span class="ptiers__range">
          {{ compact.min }}<template v-if="compact.min !== compact.max"> – {{ compact.max }}</template>
        </span>
        <span class="ptiers__n">{{ compact.count }} 档</span>
      </button>
    </template>
    <div class="tiles">
      <div v-for="part in parts" :key="part.label" class="pp">
        <span class="pp__icon">
          <PricePartMark :kind="part.kind" :label="part.label" />
        </span>
        <span class="pp__cap">{{ part.caption }}</span>
        <span class="pp__v">{{ part.text }}</span>
      </div>
    </div>
  </el-popover>
</template>

<style scoped>
.ptiers {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 26px;
  margin: 0;
  padding: 0 2px 0 0;
  border: 0;
  background: transparent;
  cursor: default;
  color: inherit;
}
.ptiers__icon {
  display: inline-flex;
}
.ptiers__range {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-variant-numeric: tabular-nums;
  font-feature-settings: 'tnum' 1;
  font-size: 13.5px;
  line-height: 18px;
  white-space: nowrap;
}
.ptiers__n {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
}
.ptiers:hover .ptiers__n {
  color: var(--el-color-primary);
}

.tiles {
  display: grid;
  grid-template-columns: 16px max-content max-content 16px max-content max-content;
  grid-auto-rows: 22px;
  grid-auto-flow: row;
  column-gap: 6px;
  row-gap: 4px;
  align-items: center;
}
.tiles > .pp {
  display: contents;
}
.pp__icon {
  width: 16px;
  height: 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.pp__cap {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
}
.pp__v {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-variant-numeric: tabular-nums;
  font-feature-settings: 'tnum' 1;
  font-size: 13px;
  line-height: 18px;
  text-align: right;
  white-space: nowrap;
}
</style>
