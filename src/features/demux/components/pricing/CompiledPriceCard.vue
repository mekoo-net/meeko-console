<script setup lang="ts">
/**
 * 渠道定价预览：入/写 一列、出/读 一列，每档写出 价格表(USD) × 渠道倍率 = 有效价(CNY)。
 */
import { computed } from 'vue';

import { formatMultiplier } from '../../model/rateSummary';
import { MODEL_KIND, type PriceDisplay, type PricePart, type PricePartKind } from '../../model/priceTable';
import PricePartMark from './PricePartMark.vue';

const props = defineProps<{
  catalog: Omit<PriceDisplay, 'price'>;
  effective: Omit<PriceDisplay, 'price'>;
  multiplier: number;
}>();

interface CmpRow {
  part: PricePart;
  catalogText: string;
}

interface Pane {
  title: string | null;
  rows: CmpRow[];
}

const PANE_TITLE = ['入 / 写', '出 / 读'] as const;

const SHORT_LABEL: Partial<Record<PricePartKind, string>> = {
  cacheWrite: '写',
  cacheRead: '读',
};

const mulText = computed(() => formatMultiplier(props.multiplier));

const kindMeta = computed(() => MODEL_KIND[props.effective.kind]);

const panes = computed<Pane[]>(() => {
  const cat = new Map(props.catalog.columns.flat().map((p) => [`${p.kind}:${p.label}`, p]));
  const zip = (parts: PricePart[]): CmpRow[] =>
    parts.map((part) => ({
      part,
      catalogText: cat.get(`${part.kind}:${part.label}`)?.text ?? part.text,
    }));

  if (props.effective.kind === 'per_token') {
    return props.effective.columns.map((col, i) => ({
      title: PANE_TITLE[i] ?? null,
      rows: zip(col),
    }));
  }

  const all = zip(props.effective.columns.flat());
  if (all.length <= 1) return [{ title: null, rows: all }];
  const mid = Math.ceil(all.length / 2);
  return [
    { title: null, rows: all.slice(0, mid) },
    { title: null, rows: all.slice(mid) },
  ];
});

function rowLabel(part: PricePart): string {
  return SHORT_LABEL[part.kind] ?? part.caption ?? part.label;
}
</script>

<template>
  <div class="cprice">
    <div class="cprice__head">
      <div class="cprice__kind-wrap">
        <span class="cprice__kind">{{ kindMeta.label }}</span>
        <span class="cprice__hint">{{ kindMeta.hint }}</span>
      </div>
      <div class="cprice__mul">
        <span class="cprice__mul-v">{{ mulText }}</span>
        <span class="cprice__mul-k">渠道倍率</span>
      </div>
    </div>

    <div class="cprice__board" :class="{ 'cprice__board--one': panes.length === 1 }">
      <section v-for="(pane, i) in panes" :key="pane.title ?? i" class="cprice__pane">
        <header v-if="pane.title" class="cprice__pane-h">{{ pane.title }}</header>
        <div v-for="row in pane.rows" :key="row.part.label" class="cprice__row">
          <div class="cprice__name">
            <PricePartMark :kind="row.part.kind" :label="row.part.label" />
            <span class="cprice__label">{{ rowLabel(row.part) }}</span>
            <span v-if="row.part.inherited" class="cprice__inherit">同入价</span>
          </div>
          <div class="cprice__eq" :class="{ 'cprice__eq--inherited': row.part.inherited }">
            <span class="cprice__cat">{{ row.catalogText }}</span>
            <span class="cprice__factor">{{ mulText }}</span>
            <span class="cprice__eqs">=</span>
            <span class="cprice__eff">{{ row.part.text }}</span>
          </div>
        </div>
      </section>
    </div>

    <p v-if="effective.note" class="cprice__note">{{ effective.note }}</p>
    <p class="cprice__foot">有效价(CNY) = 价格表(USD) {{ mulText }}</p>
  </div>
</template>

<style scoped>
.cprice {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.cprice__head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
}
.cprice__kind-wrap {
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
}
.cprice__kind {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: var(--el-color-primary);
  padding: 1px 8px;
  border-radius: 999px;
  background: var(--el-color-primary-light-9);
}
.cprice__hint {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.cprice__mul {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 3px;
  line-height: 1;
}
.cprice__mul-v {
  font-size: 22px;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.04em;
  color: var(--el-text-color-primary);
}
.cprice__mul-k {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.cprice__board {
  display: grid;
  grid-template-columns: 1fr 1fr;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 12px;
  overflow: hidden;
  background: var(--el-bg-color);
}
.cprice__board--one {
  grid-template-columns: 1fr;
}
.cprice__pane {
  min-width: 0;
  padding-bottom: 4px;
}
.cprice__pane + .cprice__pane {
  border-left: 1px solid var(--el-border-color-lighter);
}
.cprice__pane-h {
  padding: 8px 14px;
  font-size: 12px;
  font-weight: 500;
  color: var(--el-text-color-secondary);
  background: var(--el-fill-color-lighter);
  border-bottom: 1px solid var(--el-border-color-extra-light);
}
.cprice__row {
  padding: 10px 14px 8px;
}
.cprice__row + .cprice__row {
  border-top: 1px dashed var(--el-border-color-extra-light);
}
.cprice__name {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.cprice__label {
  font-size: 13px;
  color: var(--el-text-color-regular);
}
.cprice__inherit {
  font-size: 11px;
  color: var(--el-text-color-placeholder);
}
.cprice__eq {
  display: flex;
  align-items: baseline;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 4px;
  font-variant-numeric: tabular-nums;
}
.cprice__cat {
  font-size: 13px;
  color: var(--el-text-color-placeholder);
}
.cprice__factor {
  font-size: 12px;
  font-weight: 600;
  color: var(--el-text-color-secondary);
}
.cprice__eqs {
  font-size: 12px;
  color: var(--el-text-color-placeholder);
}
.cprice__eff {
  font-size: 18px;
  font-weight: 650;
  letter-spacing: -0.02em;
  color: var(--el-text-color-primary);
}
.cprice__eq--inherited .cprice__eff {
  font-weight: 500;
  color: var(--el-text-color-placeholder);
}
.cprice__note {
  margin: 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.cprice__foot {
  margin: 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>
