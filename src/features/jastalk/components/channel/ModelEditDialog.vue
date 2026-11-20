<script setup lang="ts">
/**
 * 改一个已接入的模型给用户看的样子：名称、开不开放、排第几。
 * 类别、渠道、模型名是这一行的身份，接进来以后不能改（要改就移除了重新接），所以这里不摆出来填。
 */
import { computed, reactive, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';

import type { CatalogModel } from '../../model/jastalk.types';
import { getJastalkAdminPort } from '../../services';

const props = defineProps<{
  modelValue: boolean;
  target: CatalogModel | null;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void;
  (e: 'saved'): void;
}>();

const port = getJastalkAdminPort();

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
});

const form = reactive({ displayName: '', enabled: true, sort: 0 as number | null | undefined });
const saving = ref(false);

async function submit(): Promise<void> {
  const target = props.target;
  if (!target) return;
  saving.value = true;
  try {
    const r = await port.saveModel({
      id: target.id,
      category: target.category,
      vendorKey: target.vendorKey,
      modelName: target.modelName,
      // 渠道的名字在渠道设置里改；这里原样带回去，不带的话后端会拿渠道的键把它盖掉
      vendorName: target.vendorName,
      displayName: form.displayName.trim(),
      enabled: form.enabled,
      sort: form.sort ?? target.sort,
    });
    if (!r.success) {
      ElMessage.error(r.error.message);
      return;
    }
    ElMessage.success(r.data.priced || !r.data.enabled ? '已保存' : '已保存，这个模型还没有价格，用户选不了');
    visible.value = false;
    emit('saved');
  } finally {
    saving.value = false;
  }
}

watch(
  () => [props.modelValue, props.target?.id] as const,
  ([open]) => {
    const target = props.target;
    if (!open || !target) return;
    form.displayName = target.displayName;
    form.enabled = target.enabled;
    form.sort = target.sort;
  },
);
</script>

<template>
  <el-dialog
    v-model="visible"
    title="编辑模型"
    width="460px"
    align-center
    :close-on-click-modal="false"
  >
    <el-form
      v-if="target"
      :model="form"
      label-width="56px"
      @submit.prevent
    >
      <el-form-item label="模型">
        <span class="me-key">{{ target.modelName }}</span>
      </el-form-item>
      <el-form-item label="名称">
        <el-input
          v-model="form.displayName"
          maxlength="64"
          clearable
          :placeholder="target.modelName"
        />
      </el-form-item>
      <el-form-item label="排序">
        <el-input-number
          v-model="form.sort"
          :step="10"
          :precision="0"
          controls-position="right"
        />
      </el-form-item>
      <el-form-item label="开放">
        <el-switch v-model="form.enabled" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="visible = false">
        取消
      </el-button>
      <el-button
        type="primary"
        :loading="saving"
        @click="submit"
      >
        保存
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.me-key {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 13px;
  color: var(--el-text-color-secondary);
  overflow-wrap: anywhere;
}
</style>
