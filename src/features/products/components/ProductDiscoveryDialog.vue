<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { Refresh } from '@element-plus/icons-vue';

import type { DiscoveredProduct } from '../model/product.types';
import { getProductPort } from '../services';

const props = defineProps<{
  modelValue: boolean;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  registered: [];
}>();

const port = getProductPort();
const loading = ref(false);
const registeringCode = ref<string | null>(null);
const items = ref<DiscoveredProduct[]>([]);
const displayNames = ref<Record<string, string>>({});

const visible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value),
});

watch(
  () => props.modelValue,
  (open) => {
    if (open) void load();
  },
);

async function load(): Promise<void> {
  loading.value = true;
  try {
    const r = await port.discover();
    if (r.success) {
      items.value = r.data;
      const nextNames: Record<string, string> = {};
      for (const item of r.data) {
        nextNames[item.code] = displayNames.value[item.code] ?? item.suggestedDisplayName;
      }
      displayNames.value = nextNames;
    } else {
      ElMessage.error(r.error.message);
    }
  } finally {
    loading.value = false;
  }
}

async function register(row: DiscoveredProduct): Promise<void> {
  registeringCode.value = row.code;
  try {
    const r = await port.register({
      code: row.code,
      displayName: displayNames.value[row.code]?.trim() || undefined,
    });
    if (r.success) {
      ElMessage.success(`产品「${r.data.displayName}」已注册`);
      emit('registered');
      await load();
    } else {
      ElMessage.error(r.error.message);
    }
  } finally {
    registeringCode.value = null;
  }
}
</script>

<template>
  <el-dialog v-model="visible" title="发现产品" width="760px" destroy-on-close>
    <div class="discovery-toolbar">
      <span class="discovery-toolbar__hint">从 Consul 读取业务服务声明的产品，点击注册即可加入平台。</span>
      <el-button :icon="Refresh" text :loading="loading" @click="load">刷新</el-button>
    </div>

    <el-table v-loading="loading" :data="items" size="small" class="compact-table" empty-text="未发现可注册产品">
      <el-table-column label="产品" min-width="200">
        <template #default="{ row }: { row: DiscoveredProduct }">
          <div class="cell-product">
            <span class="cell-product__name">{{ row.suggestedDisplayName }}</span>
            <span class="cell-product__code">{{ row.code }}</span>
          </div>
        </template>
      </el-table-column>
      <el-table-column prop="domain" label="业务域" width="120" />
      <el-table-column prop="serviceName" label="来源服务" width="120" />
      <el-table-column label="展示名称" min-width="180">
        <template #default="{ row }: { row: DiscoveredProduct }">
          <el-input
            v-model="displayNames[row.code]"
            size="small"
            :disabled="row.alreadyRegistered"
            placeholder="注册时可覆盖"
          />
        </template>
      </el-table-column>
      <el-table-column label="状态" width="100" align="center">
        <template #default="{ row }: { row: DiscoveredProduct }">
          <el-tag :type="row.alreadyRegistered ? 'success' : 'info'" size="small">
            {{ row.alreadyRegistered ? '已注册' : '未注册' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="100" fixed="right">
        <template #default="{ row }: { row: DiscoveredProduct }">
          <el-button
            v-if="!row.alreadyRegistered"
            link
            type="primary"
            :loading="registeringCode === row.code"
            @click="register(row)"
          >
            注册
          </el-button>
          <span v-else class="registered-hint">—</span>
        </template>
      </el-table-column>
    </el-table>
  </el-dialog>
</template>

<style scoped>
.discovery-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}
.discovery-toolbar__hint {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
.cell-product {
  display: flex;
  flex-direction: column;
  line-height: 1.35;
}
.cell-product__name {
  font-weight: 500;
}
.cell-product__code {
  font-size: 11px;
  color: var(--el-text-color-secondary);
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
}
.registered-hint {
  color: var(--el-text-color-secondary);
}
</style>
