<script setup lang="ts">
/**
 * 价格列：icon + 数字摊开各档。价格表和模型定价共用，别各写一份。
 */
import PricePartMark from './PricePartMark.vue';
import PriceTierFlyout from './PriceTierFlyout.vue';
import type { PriceDisplay } from '../model/priceTable';

defineProps<{
  model: Pick<PriceDisplay, 'kind' | 'columns' | 'compact'>;
}>();
</script>

<template>
  <div
    class="price-cells"
    :class="{
      'price-cells--tiles': (model.kind === 'per_image' || model.kind === 'per_video') && !model.compact,
    }"
  >
    <PriceTierFlyout
      v-if="model.compact"
      :kind="model.kind === 'per_video' ? 'video' : 'image'"
      :parts="model.columns.flat()"
      :compact="model.compact"
    />
    <template v-else-if="model.kind === 'per_image' || model.kind === 'per_video'">
      <div v-for="part in model.columns.flat()" :key="part.label" class="pp">
        <span class="pp__icon">
          <PricePartMark :kind="part.kind" :label="part.label" />
        </span>
        <span class="pp__cap">{{ part.caption }}</span>
        <span class="pp__v">{{ part.text }}</span>
      </div>
    </template>
    <div v-else v-for="(col, i) in model.columns" :key="i" class="pcol">
      <template v-for="part in col" :key="part.label">
        <span class="pp__icon">
          <PricePartMark :kind="part.kind" :label="part.label" />
        </span>
        <span class="pp__v" :class="{ 'pp__v--inherited': part.inherited }">
          {{ part.text }}
        </span>
      </template>
    </div>
  </div>
</template>

<style scoped>
/*
 * 数字槽钉死等宽字数：按行 max-content 的话「出」会跟着该行最长的价跑。
 * ch 跟数字同一套等宽字体、同一字号，槽宽才跟数字对得上。
 */
.price-cells {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 13.5px;
  --price-num: 10ch;
  --price-cap: 14ch;
  display: grid;
  grid-auto-flow: column;
  justify-content: start;
  align-items: start;
  column-gap: 14px;
  row-gap: 4px;
  min-width: 0;
}
.price-cells--tiles {
  grid-template-columns: 16px var(--price-cap) var(--price-num) 20px var(--price-cap) var(--price-num);
  grid-auto-rows: 18px;
  grid-auto-flow: row;
  column-gap: 4px;
  align-items: center;
}
.price-cells--tiles > .pp {
  display: contents;
}
.price-cells--tiles > .pp:nth-child(even) > .pp__icon {
  justify-self: end;
}
.pcol {
  display: grid;
  grid-template-columns: 16px var(--price-num);
  grid-auto-rows: 18px;
  column-gap: 6px;
  row-gap: 4px;
  align-items: center;
}
.pp__icon {
  width: 16px;
  height: 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.pp__icon :deep(.el-tooltip__trigger),
.pp__icon :deep(.picon) {
  display: inline-flex;
  width: 16px;
  height: 16px;
  align-items: center;
  justify-content: center;
}
.pp__cap {
  font-family: var(--el-font-family);
  font-size: 11.5px;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}
.pp__v {
  font-variant-numeric: tabular-nums;
  font-feature-settings: 'tnum' 1;
  line-height: 18px;
  text-align: right;
  white-space: nowrap;
}
.pp__v--inherited {
  color: var(--el-text-color-placeholder);
}
</style>
