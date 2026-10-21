<script setup lang="ts">
/**
 * 金额输入。用原生 input 而不是 el-input-number：定价要的是一个能一眼看清的数字，
 * 不是一对上下箭头——单价常带四位小数，点箭头调是没意义的交互。
 *
 * 空串 = null，交给调用方决定"留空"的语义（缓存价留空 = 按主价计）。
 */
import { ref, watch } from 'vue';

interface Props {
  modelValue: number | null;
  label: string;
  /** 单位说明，如「每 1M tokens」。 */
  unit: string;
  /** 留空时的提示，如「同输入价」。 */
  placeholder?: string;
  /** lg = 主价，大字号卡片；sm = 附属价，一行。 */
  size?: 'lg' | 'sm';
  /** 价格表美元 `$`，有效价人民币 `¥`。 */
  currencySymbol?: string;
}

const props = withDefaults(defineProps<Props>(), { placeholder: '', size: 'sm', currencySymbol: '¥' });

const emit = defineEmits<{ (e: 'update:modelValue', v: number | null): void }>();

function format(v: number | null): string {
  return v == null ? '' : String(v);
}

function parse(s: string): number | null {
  const t = s.trim().replace(/US\$/gi, '').replace(/[,，¥$]/g, '');
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 1e6) / 1e6;
}

const text = ref(format(props.modelValue));

watch(
  () => props.modelValue,
  (v) => {
    if (parse(text.value) !== v) text.value = format(v);
  },
);

function onInput(e: Event): void {
  text.value = (e.target as HTMLInputElement).value;
  emit('update:modelValue', parse(text.value));
}

function onBlur(): void {
  text.value = format(parse(text.value));
}
</script>

<template>
  <label class="pf" :class="`pf--${size}`">
    <span class="pf__label">{{ label }}</span>
    <span class="pf__box">
      <span class="pf__cur">{{ currencySymbol }}</span>
      <input
        class="pf__input"
        type="text"
        inputmode="decimal"
        autocomplete="off"
        :value="text"
        :placeholder="placeholder"
        @input="onInput"
        @blur="onBlur"
      />
      <span class="pf__unit">{{ unit }}</span>
    </span>
  </label>
</template>

<style scoped>
.pf {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}
.pf__label {
  font-size: 12px;
  font-weight: 500;
  color: var(--el-text-color-secondary);
}
.pf__box {
  display: flex;
  align-items: baseline;
  gap: 6px;
  padding: 10px 12px;
  border: 1px solid var(--el-border-color);
  border-radius: 10px;
  background: var(--el-bg-color);
  transition:
    border-color 0.15s,
    box-shadow 0.15s;
}
.pf__box:hover {
  border-color: var(--el-border-color-darker);
}
.pf__box:focus-within {
  border-color: var(--el-color-primary);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--el-color-primary) 14%, transparent);
}
.pf__cur {
  color: var(--el-text-color-secondary);
  line-height: 1;
}
.pf__input {
  flex: 1;
  min-width: 0;
  border: 0;
  padding: 0;
  background: transparent;
  color: var(--el-text-color-primary);
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.02em;
  outline: none;
}
.pf__input::placeholder {
  color: var(--el-text-color-placeholder);
  letter-spacing: 0;
}
.pf__unit {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
}

/* 主价：一张卡，数字大到能一眼确认 */
.pf--lg .pf__box {
  flex-wrap: wrap;
  padding: 14px 16px;
  background: var(--el-fill-color-lighter);
}
.pf--lg .pf__cur {
  font-size: 17px;
}
.pf--lg .pf__input {
  font-size: 26px;
  font-weight: 600;
}
.pf--lg .pf__unit {
  flex-basis: 100%;
  margin-top: 4px;
}

/* 附属价：紧凑一行 */
.pf--sm .pf__label {
  font-size: 12px;
}
.pf--sm .pf__box {
  padding: 7px 10px;
}
.pf--sm .pf__cur {
  font-size: 13px;
}
.pf--sm .pf__input {
  font-size: 14px;
}
.pf--sm .pf__unit {
  font-size: 11px;
}
</style>
