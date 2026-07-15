<script setup lang="ts">
/**
 * 概览页专用的时间范围过滤栏。
 *
 * 仅一行：时间范围 picker  +  快捷按钮（24h / 7d / 30d）  +  查询 / 重置。
 * （与共享 `FilterBar` 的差异：去掉了账户 UID / 邮箱-手机两行，业务过滤仅按时间。）
 */
import { ref, watch } from 'vue';
import { RefreshLeft, Search } from '@element-plus/icons-vue';

import { toLocalDateTimeValue } from '@/shared/lib/date';

const dateRange = defineModel<[string, string] | null>('dateRange', { required: true });

defineProps<{ loading: boolean }>();

const emit = defineEmits<{
  (e: 'refresh'): void;
  (e: 'reset'): void;
}>();

const datePickerDefaultTime: [Date, Date] = [
  new Date(2000, 0, 1, 0, 0, 0),
  new Date(2000, 0, 1, 23, 59, 59),
];

type QuickKey = '24h' | '7d' | '30d';

const quickRangeMs: Readonly<Record<QuickKey, number>> = {
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
};

/**
 * 判断当前区间是否等于某个快捷范围（用于父组件以默认值“近 24h”初始化时点亮按钮）。
 * 结束时间需贴近“现在”，否则视为用户自定义的历史区间，不点亮。
 */
function matchQuick(range: [string, string] | null): QuickKey | '' {
  if (!range?.[0] || !range[1]) return '';
  const from = new Date(range[0]).getTime();
  const to = new Date(range[1]).getTime();
  if (!Number.isFinite(from) || !Number.isFinite(to)) return '';
  if (Math.abs(Date.now() - to) > 60_000) return '';
  const span = to - from;
  for (const key of Object.keys(quickRangeMs) as QuickKey[]) {
    if (Math.abs(span - quickRangeMs[key]) <= 2_000) return key;
  }
  return '';
}

const activeQuick = ref<QuickKey | ''>(matchQuick(dateRange.value));
let suppressNextWatch = false;

function pickQuick(key: QuickKey): void {
  const now = new Date();
  const from = new Date(now.getTime() - quickRangeMs[key]);
  activeQuick.value = key;
  suppressNextWatch = true;
  dateRange.value = [toLocalDateTimeValue(from), toLocalDateTimeValue(now)];
  emit('refresh');
}

watch(dateRange, (val) => {
  if (suppressNextWatch) {
    suppressNextWatch = false;
    return;
  }
  activeQuick.value = matchQuick(val);
});

/**
 * 点「查询」刷新：若当前是快捷区间（近 24h / 7d / 30d），把结束时间刷新到「现在」，
 * 否则相对区间会冻结在进页那一刻，刷新拉不到最新数据。
 * 概览页不在 dateRange 变化时自动请求，故此处统一 emit('refresh')。
 */
function onRefresh(): void {
  const key = activeQuick.value;
  if (key) {
    const now = new Date();
    const from = new Date(now.getTime() - quickRangeMs[key]);
    const next: [string, string] = [toLocalDateTimeValue(from), toLocalDateTimeValue(now)];
    const cur = dateRange.value;
    if (!cur || cur[0] !== next[0] || cur[1] !== next[1]) {
      suppressNextWatch = true;
      dateRange.value = next;
    }
  }
  emit('refresh');
}

function onReset(): void {
  activeQuick.value = '24h';
  emit('reset');
  emit('refresh');
}
</script>

<template>
  <el-form label-width="84px" class="filter-bar" @submit.prevent>
    <div class="filter-bar__row">
      <el-form-item label="时间范围" class="filter-bar__date-item">
        <el-date-picker
          v-model="dateRange"
          type="datetimerange"
          range-separator="至"
          start-placeholder="开始时间"
          end-placeholder="结束时间"
          format="YYYY-MM-DD HH:mm"
          value-format="YYYY-MM-DDTHH:mm:ss"
          :default-time="datePickerDefaultTime"
          unlink-panels
          clearable
        />
        <el-button-group class="quick-range">
          <el-button :type="activeQuick === '24h' ? 'primary' : ''" @click="pickQuick('24h')">
            最近 24 小时
          </el-button>
          <el-button :type="activeQuick === '7d' ? 'primary' : ''" @click="pickQuick('7d')">
            最近 7 天
          </el-button>
          <el-button :type="activeQuick === '30d' ? 'primary' : ''" @click="pickQuick('30d')">
            最近 30 天
          </el-button>
        </el-button-group>
      </el-form-item>

      <div class="filter-bar__actions">
        <el-button type="primary" :icon="Search" :loading="loading" @click="onRefresh">
          查询
        </el-button>
        <el-button :icon="RefreshLeft" @click="onReset">重置</el-button>
      </div>
    </div>
  </el-form>
</template>

<style scoped>
.filter-bar {
  background: #fff;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  padding: 16px 20px;
  margin-bottom: 14px;
}
.filter-bar__row {
  display: flex;
  align-items: center;
  gap: 28px;
}
.filter-bar :deep(.el-form-item) {
  margin: 0;
  flex-shrink: 0;
}
.filter-bar :deep(.el-form-item__label) {
  font-size: 13px;
  font-weight: 500;
  color: var(--el-text-color-regular);
}
.filter-bar__date-item :deep(.el-form-item__content) {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: nowrap;
}
.filter-bar__date-item :deep(.el-date-editor) {
  width: 400px;
}
.quick-range {
  flex-shrink: 0;
}
.quick-range :deep(.el-button) {
  padding: 8px 18px;
  font-size: 13px;
  font-weight: 500;
  min-width: 110px;
}
.filter-bar__actions {
  margin-left: auto;
  display: flex;
  gap: 10px;
}
</style>
