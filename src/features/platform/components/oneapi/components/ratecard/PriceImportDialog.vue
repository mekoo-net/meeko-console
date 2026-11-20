<script setup lang="ts">
/**
 * 批量导入：贴一段 JSON。主要用来把别处现成的一张表一次搬过来——价格表列表接口回的 items 可以原样贴，
 * 多出来的字段号池后台不认也不报错。
 *
 * 号池后台先整批验完再动库，任何一行不过整批都不写，所以这里只认出「有几行」，不逐行预检。
 * 导完不关窗，先把新增 / 覆盖 / 跳过各多少行摆出来：一次动几百行，得有个数可对。
 */
import { computed, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';

import { failureText, parseImportText } from '../../model/ratecard';
import type { PriceImportResult } from '../../model/ratecard.types';
import { getOneApiRatecardPort } from '../../services';
import PricePublishAlert from './PricePublishAlert.vue';

const props = defineProps<{ modelValue: boolean }>();

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void;
  (e: 'imported', result: PriceImportResult): void;
}>();

const port = getOneApiRatecardPort();

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
});

const text = ref('');
const overwrite = ref(false);
const submitting = ref(false);
const result = ref<PriceImportResult | null>(null);

const draft = computed(() => parseImportText(text.value));

const counts = computed(() =>
  result.value
    ? [
        { label: '新增', value: result.value.added },
        { label: '覆盖', value: result.value.overwritten },
        { label: '跳过', value: result.value.skipped },
      ]
    : [],
);

async function submit(): Promise<void> {
  const items = draft.value.items;
  if (!items) return;
  submitting.value = true;
  try {
    const r = await port.importPrices({ items, overwrite: overwrite.value });
    if (!r.success) {
      ElMessage.error(failureText(r.error));
      return;
    }
    result.value = r.data;
    emit('imported', r.data);
  } finally {
    submitting.value = false;
  }
}

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return;
    text.value = '';
    overwrite.value = false;
    submitting.value = false;
    result.value = null;
  },
);
</script>

<template>
  <el-dialog
    v-model="visible"
    title="导入牌价"
    width="720px"
    :close-on-click-modal="false"
  >
    <div
      v-if="result"
      class="import-result"
    >
      <div class="import-counts">
        <div
          v-for="c in counts"
          :key="c.label"
          class="import-count"
        >
          <span class="import-count__k">{{ c.label }}</span>
          <span class="import-count__v">{{ c.value }}</span>
        </div>
      </div>
      <PricePublishAlert
        v-if="!result.publish.ok"
        :failures="result.publish.failures"
      />
    </div>

    <template v-else>
      <el-input
        v-model="text"
        type="textarea"
        :rows="16"
        resize="none"
        spellcheck="false"
        placeholder="JSON：数组，或带 items 的对象"
        class="import-text"
      />
      <div class="import-bar">
        <el-checkbox
          v-model="overwrite"
          :disabled="submitting"
        >
          覆盖已有的
        </el-checkbox>
        <span
          v-if="draft.items"
          class="import-bar__count"
        >{{ draft.items.length }} 行</span>
        <span
          v-else-if="draft.problem"
          class="import-bar__problem"
        >{{ draft.problem }}</span>
      </div>
    </template>

    <template #footer>
      <el-button
        v-if="result"
        type="primary"
        @click="visible = false"
      >
        完成
      </el-button>
      <template v-else>
        <el-button
          :disabled="submitting"
          @click="visible = false"
        >
          取消
        </el-button>
        <el-button
          type="primary"
          :disabled="!draft.items"
          :loading="submitting"
          @click="submit"
        >
          导入
        </el-button>
      </template>
    </template>
  </el-dialog>
</template>

<style scoped>
.import-text :deep(textarea) {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 12.5px;
  line-height: 1.5;
}
.import-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 10px;
  font-size: 13px;
}
.import-bar__count {
  font-variant-numeric: tabular-nums;
  color: var(--el-text-color-secondary);
}
.import-bar__problem {
  color: var(--el-color-danger);
}
.import-result {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.import-counts {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}
.import-count {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px 16px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
}
.import-count__k {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.import-count__v {
  font-size: 22px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--el-text-color-primary);
}
</style>
