<script setup lang="ts">
import { computed, ref } from 'vue';
import { ArrowDown, ArrowRight } from '@element-plus/icons-vue';

import {
  DARK,
  THEME_PRESETS,
  THEME_TOKENS,
  formatGradient,
  invalidThemeValue,
  parseGradient,
  presetKeyOf,
  presetTheme,
  themeTokenLabels,
  type ActivityTheme,
  type ThemeToken,
} from '../model/activityTheme';

/**
 * 主题编辑：一组 CSS 变量。点预设一键填入，之后每个值都能改——取色器改颜色，渐变有几个颜色点就给几个取色器，
 * 输入框里是 CSS 值本身，想写什么渐变都行。深色模式的值可选，空着就沿用浅色。
 */
const theme = defineModel<ActivityTheme>({ required: true });

// 深色的值大多用预设里带的，平时收起来。
const showDark = ref(false);

const activePreset = computed(() => presetKeyOf(theme.value));

function applyPreset(key: string): void {
  theme.value = presetTheme(key);
}

function set(key: string, value: string): void {
  const next = { ...theme.value };
  if (value.trim()) next[key] = value;
  else delete next[key];
  theme.value = next;
}

const keyOf = (token: ThemeToken, dark: boolean) => (dark ? token + DARK : token);
const gradientOf = (key: string) => parseGradient(theme.value[key] ?? '');

function setStop(key: string, index: number, color: string | null): void {
  const g = gradientOf(key);
  if (!g || !color) return;
  g.stops[index] = { ...g.stops[index]!, color };
  set(key, formatGradient(g));
}
</script>

<template>
  <div class="te">
    <div class="te__presets">
      <button
        v-for="p in THEME_PRESETS"
        :key="p.key"
        type="button"
        class="te__preset"
        :class="{ 'te__preset--active': activePreset === p.key }"
        :style="{ background: p.theme.banner, color: p.theme.ink }"
        @click="applyPreset(p.key)"
      >
        {{ p.label }}
      </button>
    </div>

    <template
      v-for="dark in (showDark ? [false, true] : [false])"
      :key="String(dark)"
    >
      <div
        v-if="dark"
        class="te__group"
      >
        深色模式
      </div>
      <div
        v-for="token in THEME_TOKENS"
        :key="keyOf(token, dark)"
        class="te__row"
      >
        <span class="te__label">{{ themeTokenLabels[token] }}</span>
        <span class="te__pickers">
          <template v-if="gradientOf(keyOf(token, dark))">
            <el-color-picker
              v-for="(stop, i) in gradientOf(keyOf(token, dark))!.stops"
              :key="i"
              size="small"
              show-alpha
              :model-value="stop.color"
              @change="(c: string | null) => setStop(keyOf(token, dark), i, c)"
            />
          </template>
          <el-color-picker
            v-else
            size="small"
            show-alpha
            :model-value="theme[keyOf(token, dark)] ?? ''"
            @change="(c: string | null) => set(keyOf(token, dark), c ?? '')"
          />
        </span>
        <el-input
          size="small"
          class="te__value"
          :class="{ 'te__value--bad': !!invalidThemeValue(theme[keyOf(token, dark)] ?? '') }"
          :model-value="theme[keyOf(token, dark)] ?? ''"
          :placeholder="dark ? '沿用浅色' : ''"
          :title="invalidThemeValue(theme[keyOf(token, dark)] ?? '') ?? theme[keyOf(token, dark)] ?? ''"
          @update:model-value="(v: string) => set(keyOf(token, dark), v)"
        />
      </div>
    </template>

    <el-button
      class="te__toggle"
      size="small"
      text
      :icon="showDark ? ArrowDown : ArrowRight"
      @click="showDark = !showDark"
    >
      深色模式
    </el-button>
  </div>
</template>

<style scoped>
.te__presets {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
  margin-bottom: 10px;
}
.te__preset {
  height: 30px;
  border: 2px solid transparent;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}
.te__preset--active {
  border-color: var(--el-color-primary);
}
.te__group {
  margin: 10px 0 4px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.te__row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
}
.te__label {
  flex-shrink: 0;
  width: 52px;
  font-size: 12px;
  color: var(--el-text-color-regular);
}
.te__pickers {
  display: inline-flex;
  flex-shrink: 0;
  gap: 2px;
}
.te__value {
  flex: 1;
  min-width: 0;
}
.te__value :deep(input) {
  font-family: var(--el-font-family-mono, ui-monospace, monospace);
  font-size: 11px;
}
.te__value--bad :deep(.el-input__wrapper) {
  box-shadow: 0 0 0 1px var(--el-color-danger) inset;
}
.te__toggle {
  margin-top: 6px;
  padding-left: 0;
}
</style>
