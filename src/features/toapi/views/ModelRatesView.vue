<script setup lang="ts">
/**
 * 模型定价：按渠道分组维护单价。从「渠道分组」点定价会带上 ?group=。
 */
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { Edit, Plus, Refresh, Remove, Search } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';

import EmptyState from '@/shared/ui/EmptyState.vue';
import FillListPageLayout from '@/shared/ui/FillListPageLayout.vue';
import PageHeader from '@/shared/ui/PageHeader.vue';
import StatusTag from '@/shared/ui/StatusTag.vue';
import { confirmDanger } from '@/shared/composables/useConfirm';
import { formatDateTime } from '@/shared/lib/date';
import type { AppError } from '@/shared/api/httpTypes';

import ChannelTag from '../components/ChannelTag.vue';
import ModelRatePublishDialog from '../components/ModelRatePublishDialog.vue';
import {
  summarizeRate,
  ToApiBillingTypeLabel,
  type ModelRate,
  type SupplyGroup,
  type ToApiBillingType,
} from '../model/pricing.types';
import { getToApiPricingPort } from '../services';

const route = useRoute();
const port = getToApiPricingPort();

const groups = ref<SupplyGroup[]>([]);
const rates = ref<ModelRate[]>([]);
const loading = ref(false);
const error = ref<AppError | undefined>();

/** 从「渠道分组」点定价带进来的 ?group=；在这里初始化，别在 onMounted 里再赋值触发第二次拉取。 */
const groupFilter = ref<string>(typeof route.query.group === 'string' ? route.query.group.trim() : '');
const keyword = ref('');
const showHistory = ref(false);

const dialogVisible = ref(false);
const dialogSource = ref<ModelRate | null>(null);

const groupName = computed(() => new Map(groups.value.map((g) => [g.key, g.name])));

const billingTone: Record<ToApiBillingType, 'primary' | 'warning' | 'success'> = {
  per_token: 'primary',
  per_image: 'warning',
  per_video: 'success',
};

const filtered = computed(() => {
  const kw = keyword.value.trim().toLowerCase();
  if (!kw) return rates.value;
  return rates.value.filter(
    (r) =>
      r.modelId.toLowerCase().includes(kw) ||
      r.meta.displayName.toLowerCase().includes(kw) ||
      r.meta.family.toLowerCase().includes(kw) ||
      r.groupKey.toLowerCase().includes(kw),
  );
});

async function fetchGroups(): Promise<void> {
  const r = await port.listGroups();
  if (r.success) groups.value = r.data;
}

async function fetchRates(): Promise<void> {
  loading.value = true;
  error.value = undefined;
  try {
    const r = await port.listRates({
      groupKey: groupFilter.value || undefined,
      history: showHistory.value,
    });
    if (r.success) rates.value = r.data;
    else {
      error.value = r.error;
      ElMessage.error(r.error.message);
    }
  } finally {
    loading.value = false;
  }
}

async function refreshAll(): Promise<void> {
  await Promise.all([fetchGroups(), fetchRates()]);
}

function openPublish(): void {
  dialogSource.value = null;
  dialogVisible.value = true;
}

function openRepublish(row: ModelRate): void {
  dialogSource.value = row;
  dialogVisible.value = true;
}

async function retire(row: ModelRate): Promise<void> {
  const okp = await confirmDanger({
    title: '下架定价',
    message: `下架「${row.groupKey} / ${row.modelId}」后，绑这个分组的令牌请求该模型会因 rate_missing 被拒；历史占用单不受影响。`,
    confirmText: '下架',
    type: 'warning',
  });
  if (!okp) return;
  const r = await port.retireRate(row.groupKey, row.modelId);
  if (r.success) {
    ElMessage.success('已下架');
    await fetchRates();
  } else {
    ElMessage.error(r.error.message);
  }
}

watch([groupFilter, showHistory], () => void fetchRates());

onMounted(() => void refreshAll());
</script>

<template>
  <FillListPageLayout>
    <template #header>
      <PageHeader
        title="模型定价"
        description="单价挂在渠道分组上：令牌绑哪一组，就按哪一组的价扣。聊天按 token、生图按张、生视频按秒。改价发布新行，旧行归档。"
      >
        <template #actions>
          <el-button
            :icon="Refresh"
            :loading="loading"
            @click="refreshAll()"
          >
            刷新
          </el-button>
          <el-button
            type="primary"
            :icon="Plus"
            :disabled="groups.length === 0"
            @click="openPublish"
          >
            发布定价
          </el-button>
        </template>
      </PageHeader>
    </template>

    <template #filters>
      <div class="filter-bar">
        <el-select
          v-model="groupFilter"
          placeholder="全部分组"
          clearable
          style="width: 260px"
        >
          <el-option
            v-for="g in groups"
            :key="g.key"
            :label="`${g.name} (${g.key})`"
            :value="g.key"
          />
        </el-select>
        <el-input
          v-model="keyword"
          :prefix-icon="Search"
          placeholder="模型 ID / 显示名"
          clearable
          style="width: 220px"
        />
        <el-checkbox v-model="showHistory">
          显示已归档版本
        </el-checkbox>
        <span class="filter-bar__meta">
          共 <strong>{{ filtered.length }}</strong> 行
        </span>
      </div>

      <el-alert
        v-if="error"
        :title="`加载失败：${error.code}`"
        :description="error.message"
        type="error"
        show-icon
        :closable="false"
      />
    </template>

    <el-table
      v-loading="loading"
      :data="filtered"
      row-key="id"
      size="small"
      class="compact-table"
      height="100%"
      :empty-text="' '"
    >
      <el-table-column
        label="模型"
        min-width="220"
        fixed="left"
      >
        <template #default="{ row }: { row: ModelRate }">
          <div class="cell-model">
            <span class="cell-model__name">{{ row.meta.displayName || row.modelId }}</span>
            <span class="cell-model__meta">
              <code>{{ row.modelId }}</code>
              <span v-if="row.meta.family">· {{ row.meta.family }}</span>
            </span>
          </div>
        </template>
      </el-table-column>

      <el-table-column
        label="分组"
        min-width="180"
      >
        <template #default="{ row }: { row: ModelRate }">
          <div class="cell-group">
            <span>{{ groupName.get(row.groupKey) ?? row.groupKey }}</span>
            <ChannelTag :vendor-key="row.groupKey" />
          </div>
        </template>
      </el-table-column>

      <el-table-column
        label="口径"
        width="100"
        align="center"
      >
        <template #default="{ row }: { row: ModelRate }">
          <StatusTag
            :label="ToApiBillingTypeLabel[row.billingType as ToApiBillingType]"
            :tone="billingTone[row.billingType as ToApiBillingType]"
          />
        </template>
      </el-table-column>

      <el-table-column
        label="单价"
        min-width="220"
      >
        <template #default="{ row }: { row: ModelRate }">
          <span class="cell-price">{{ summarizeRate(row) }}</span>
        </template>
      </el-table-column>

      <el-table-column
        label="状态"
        width="96"
        align="center"
      >
        <template #default="{ row }: { row: ModelRate }">
          <StatusTag
            :label="row.status === 'active' ? '生效中' : '已归档'"
            :tone="row.status === 'active' ? 'success' : 'info'"
          />
        </template>
      </el-table-column>

      <el-table-column
        label="生效"
        width="150"
      >
        <template #default="{ row }: { row: ModelRate }">
          <span class="cell-muted">{{ formatDateTime(row.effectiveFromUtc) }}</span>
        </template>
      </el-table-column>

      <el-table-column
        label="操作"
        width="110"
        fixed="right"
        align="center"
      >
        <template #default="{ row }: { row: ModelRate }">
          <template v-if="row.status === 'active'">
            <el-button
              link
              type="primary"
              :icon="Edit"
              title="改价"
              @click.stop="openRepublish(row)"
            />
            <el-button
              link
              type="danger"
              :icon="Remove"
              title="下架"
              @click.stop="retire(row)"
            />
          </template>
          <span
            v-else
            class="cell-muted"
          >—</span>
        </template>
      </el-table-column>

      <template #empty>
        <EmptyState
          title="暂无定价"
          :description="
            groups.length
              ? '点击「发布定价」，单价会挂到所选渠道分组上。'
              : '先到「渠道分组」接入一个供应商，再回来标价。'
          "
        />
      </template>
    </el-table>
  </FillListPageLayout>

  <ModelRatePublishDialog
    v-model:visible="dialogVisible"
    :groups="groups"
    :source="dialogSource"
    :default-group-key="groupFilter || undefined"
    @published="fetchRates()"
  />
</template>

<style scoped>
.filter-bar {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
}
.filter-bar__meta {
  margin-left: auto;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
.filter-bar__meta strong {
  color: var(--el-text-color-primary);
  font-weight: 600;
}
.cell-model {
  display: flex;
  flex-direction: column;
  gap: 3px;
  line-height: 1.35;
}
.cell-model__name {
  font-weight: 600;
  color: var(--el-text-color-primary);
}
.cell-model__meta {
  display: flex;
  gap: 6px;
  font-size: 12px;
  color: var(--el-text-color-placeholder);
}
.cell-model__meta code {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 11px;
  color: var(--el-text-color-secondary);
  background: #f1f5f9;
  padding: 1px 6px;
  border-radius: 4px;
}
.cell-group {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.cell-price {
  font-variant-numeric: tabular-nums;
  font-size: 13px;
}
.cell-muted {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>
