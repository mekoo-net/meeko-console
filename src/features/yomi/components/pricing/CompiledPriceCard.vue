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

/** 一条「价格表 × 倍率 = 有效价」。`tier` 是同一行里的档位名（缓存写的 5m / 1h），单档的行没有。 */
interface CmpLine {
  tier: string | null;
  part: PricePart;
  catalogText: string;
}

/**
 * 一行一个价。缓存写的两档是同一个价的两个时长，并排收在同一行里：各占一行的话，
 * 「入 / 写」这一栏就比「出 / 读」高出一截。并排放不下整条算式，所以两档只写有效价，算式放在悬停提示里。
 */
interface CmpRow {
  part: PricePart;
  lines: CmpLine[];
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
  const line = (part: PricePart, tier: string | null): CmpLine => ({
    tier,
    part,
    catalogText: cat.get(`${part.kind}:${part.label}`)?.text ?? part.text,
  });
  const zip = (parts: PricePart[]): CmpRow[] => {
    const rows: CmpRow[] = [];
    for (const part of parts) {
      const write = rows.at(-1);
      // 1 小时档接在它前面那行缓存写下面：两档合成一行，前一条补上档位名。
      if (part.kind === 'cacheWrite1h' && write?.part.kind === 'cacheWrite') {
        write.lines[0]!.tier = '5m';
        write.lines.push(line(part, '1h'));
        continue;
      }
      rows.push({ part, lines: [line(part, null)] });
    }
    return rows;
  };

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

/** 并排的档位不写算式，悬停时给全：价格表 × 倍率 = 有效价，以及这个数是不是照别的价推出来的。 */
function lineTitle(ln: CmpLine): string {
  const eq = `${ln.catalogText} ${mulText.value} = ${ln.part.text}`;
  return ln.part.inherited ? `${eq}（${ln.part.inheritedNote ?? '同入价'}）` : eq;
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
            <PricePartMark :kind="row.part.kind" :label="rowLabel(row.part)" />
            <span class="cprice__label">{{ rowLabel(row.part) }}</span>
            <span v-if="row.lines.length === 1 && row.part.inherited" class="cprice__inherit">
              {{ row.part.inheritedNote ?? '同入价' }}
            </span>
          </div>
          <div v-if="row.lines.length > 1" class="cprice__eq cprice__eq--tiers">
            <span
              v-for="ln in row.lines"
              :key="ln.part.label"
              class="cprice__tierv"
              :class="{ 'cprice__eq--inherited': ln.part.inherited }"
              :title="lineTitle(ln)"
            >
              <span class="cprice__tier">{{ ln.tier }}</span>
              <span class="cprice__eff">{{ ln.part.text }}</span>
            </span>
          </div>
          <div
            v-else
            class="cprice__eq"
            :class="{ 'cprice__eq--inherited': row.part.inherited }"
          >
            <span class="cprice__cat">{{ row.lines[0]!.catalogText }}</span>
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
/* 同一个价的两档并排：档位名 + 有效价，一档一组。与单档那一行同一个容器、同一个字号，行高才一样。 */
.cprice__eq--tiers {
  gap: 4px 14px;
}
.cprice__tierv {
  display: inline-flex;
  align-items: baseline;
  gap: 4px;
  white-space: nowrap;
}
.cprice__tier {
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
