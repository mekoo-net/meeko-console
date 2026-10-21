<script setup lang="ts">
/**
 * 渠道分组：ToB 反代的计费单位。令牌绑定分组；一个供应商只落成一个分组（key = vendor_key）。
 * 表格形态对齐 sub2api Groups，不抄 Yomi 的供应商目录工作区。
 */
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { Edit, Plus, PriceTag, Refresh, Search, TurnOff } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';

import EmptyState from '@/shared/ui/EmptyState.vue';
import FillListPageLayout from '@/shared/ui/FillListPageLayout.vue';
import PageHeader from '@/shared/ui/PageHeader.vue';
import StatusTag from '@/shared/ui/StatusTag.vue';
import { confirmDanger } from '@/shared/composables/useConfirm';
import { formatDateTime } from '@/shared/lib/date';
import type { AppError } from '@/shared/api/httpTypes';

import VendorConnectDialog from '../components/VendorConnectDialog.vue';
import ChannelTag from '../components/ChannelTag.vue';
import SupplyGroupEditDialog from '../components/SupplyGroupEditDialog.vue';
import {
  ChannelBillingKindLabel,
  resolveChannel,
  toapiChannels,
  type ChannelDef,
} from '../model/channel.types';
import { CatalogStatusLabel, type CatalogStatus, type SupplyGroup } from '../model/pricing.types';
import { getToApiPricingPort } from '../services';

const port = getToApiPricingPort();
const router = useRouter();

const groups = ref<SupplyGroup[]>([]);
const rateCountByGroup = ref<Record<string, number>>({});
const modelCountByGroup = ref<Record<string, number>>({});
const loading = ref(false);
const error = ref<AppError | undefined>();

const keyword = ref('');
const channelFilter = ref<string>('');
const statusFilter = ref<CatalogStatus | 'all'>('all');

const connectVisible = ref(false);
const editVisible = ref(false);
const editing = ref<SupplyGroup | null>(null);

const statusTone: Record<CatalogStatus, 'success' | 'primary' | 'info' | 'danger'> = {
  live: 'success',
  beta: 'primary',
  soon: 'info',
  disabled: 'danger',
};

function countBy<T>(items: readonly T[], key: (item: T) => string): Record<string, number> {
  const map: Record<string, number> = {};
  for (const item of items) {
    const k = key(item);
    map[k] = (map[k] ?? 0) + 1;
  }
  return map;
}

/** 每行只解析一次目录，模板里别反复 resolveChannel。 */
const channelByKey = computed(() => new Map(groups.value.map((g) => [g.key, resolveChannel(g.key)])));

function channelOf(row: SupplyGroup): ChannelDef | null {
  return channelByKey.value.get(row.key) ?? null;
}

function billingKindText(row: SupplyGroup): string {
  const ch = channelOf(row);
  return ch ? ChannelBillingKindLabel[ch.billingKind] : '—';
}

const filtered = computed(() => {
  const kw = keyword.value.trim().toLowerCase();
  return groups.value.filter((g) => {
    if (statusFilter.value !== 'all' && g.status !== statusFilter.value) return false;
    const ch = channelOf(g);
    if (channelFilter.value === '__custom__' && ch) return false;
    if (channelFilter.value && channelFilter.value !== '__custom__' && ch?.id !== channelFilter.value) {
      return false;
    }
    if (!kw) return true;
    return (
      g.name.toLowerCase().includes(kw) ||
      g.key.toLowerCase().includes(kw) ||
      (ch?.name.toLowerCase().includes(kw) ?? false) ||
      (ch?.protocol.toLowerCase().includes(kw) ?? false)
    );
  });
});

async function fetchData(): Promise<void> {
  loading.value = true;
  error.value = undefined;
  try {
    const [g, r, m] = await Promise.all([
      port.listGroups(),
      port.listRates({ history: false }),
      port.listVendorModels(),
    ]);
    if (!g.success) {
      error.value = g.error;
      ElMessage.error(g.error.message);
      return;
    }
    groups.value = g.data;
    if (r.success) rateCountByGroup.value = countBy(r.data.filter((x) => x.status === 'active'), (x) => x.groupKey);
    if (m.success) modelCountByGroup.value = countBy(m.data, (x) => x.vendorKey);
  } finally {
    loading.value = false;
  }
}

function openConnect(): void {
  connectVisible.value = true;
}

function openEdit(row: SupplyGroup): void {
  editing.value = row;
  editVisible.value = true;
}

function goRates(row: SupplyGroup): void {
  void router.push({ name: 'toapi-rates', query: { group: row.key } });
}

async function disableRow(row: SupplyGroup): Promise<void> {
  const okp = await confirmDanger({
    title: '停用分组',
    message: `停用「${row.name}」后，绑这个分组的令牌不再可计费，进行中的请求不受影响。`,
    confirmText: '停用',
    type: 'warning',
  });
  if (!okp) return;
  const r = await port.disableGroup(row.key);
  if (r.success) {
    ElMessage.success('已停用');
    await fetchData();
  } else {
    ElMessage.error(r.error.message);
  }
}

onMounted(() => void fetchData());
</script>

<template>
  <FillListPageLayout>
    <template #header>
      <PageHeader
        title="渠道分组"
        description="ToApi 是 ToB 反代：令牌绑定分组计费。一个供应商（Cursor / Kiro / …）只落成一个分组，分组 key 就是 vendor_key。"
      >
        <template #actions>
          <el-button
            :icon="Refresh"
            :loading="loading"
            @click="fetchData()"
          >
            刷新
          </el-button>
          <el-button
            type="primary"
            :icon="Plus"
            @click="openConnect"
          >
            接入供应商
          </el-button>
        </template>
      </PageHeader>
    </template>

    <template #filters>
      <div class="filter-bar">
        <el-input
          v-model="keyword"
          :prefix-icon="Search"
          placeholder="搜索分组 / key / 供应商"
          clearable
          style="width: 260px"
        />
        <el-select
          v-model="channelFilter"
          placeholder="全部供应商"
          clearable
          style="width: 180px"
        >
          <el-option
            v-for="ch in toapiChannels"
            :key="ch.id"
            :label="ch.name"
            :value="ch.id"
          />
          <el-option
            label="自定义"
            value="__custom__"
          />
        </el-select>
        <el-select
          v-model="statusFilter"
          style="width: 140px"
        >
          <el-option
            label="全部状态"
            value="all"
          />
          <el-option
            label="已上线"
            value="live"
          />
          <el-option
            label="Beta"
            value="beta"
          />
          <el-option
            label="即将上线"
            value="soon"
          />
          <el-option
            label="已停用"
            value="disabled"
          />
        </el-select>
        <span class="filter-bar__meta">
          {{ filtered.length }} / {{ groups.length }} 个分组
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
        label="分组"
        min-width="220"
      >
        <template #default="{ row }: { row: SupplyGroup }">
          <div class="cell-group">
            <span class="cell-group__name">{{ row.name }}</span>
            <code class="cell-group__key">{{ row.key }}</code>
          </div>
        </template>
      </el-table-column>

      <el-table-column
        label="供应商"
        width="130"
      >
        <template #default="{ row }: { row: SupplyGroup }">
          <ChannelTag :vendor-key="row.key" />
        </template>
      </el-table-column>

      <el-table-column
        label="协议"
        min-width="160"
      >
        <template #default="{ row }: { row: SupplyGroup }">
          <span class="cell-muted">{{ channelOf(row)?.protocol ?? '—' }}</span>
        </template>
      </el-table-column>

      <el-table-column
        label="供应商计量"
        width="120"
      >
        <template #default="{ row }: { row: SupplyGroup }">
          <span class="cell-muted">{{ billingKindText(row) }}</span>
        </template>
      </el-table-column>

      <el-table-column
        label="已接入模型"
        width="110"
        align="center"
      >
        <template #default="{ row }: { row: SupplyGroup }">
          <span class="num">{{ modelCountByGroup[row.key] ?? 0 }}</span>
        </template>
      </el-table-column>

      <el-table-column
        label="已定价"
        width="90"
        align="center"
      >
        <template #default="{ row }: { row: SupplyGroup }">
          <span
            class="num"
            :class="{ 'num--warn': (rateCountByGroup[row.key] ?? 0) < (modelCountByGroup[row.key] ?? 0) }"
          >
            {{ rateCountByGroup[row.key] ?? 0 }}
          </span>
        </template>
      </el-table-column>

      <el-table-column
        label="状态"
        width="100"
        align="center"
      >
        <template #default="{ row }: { row: SupplyGroup }">
          <StatusTag
            :label="CatalogStatusLabel[row.status as CatalogStatus]"
            :tone="statusTone[row.status as CatalogStatus]"
          />
        </template>
      </el-table-column>

      <el-table-column
        label="更新"
        width="150"
      >
        <template #default="{ row }: { row: SupplyGroup }">
          <span class="cell-muted">{{ formatDateTime(row.updatedAtUtc) }}</span>
        </template>
      </el-table-column>

      <el-table-column
        label="操作"
        width="160"
        fixed="right"
        align="center"
      >
        <template #default="{ row }: { row: SupplyGroup }">
          <el-button
            link
            type="primary"
            :icon="PriceTag"
            title="模型定价"
            @click.stop="goRates(row)"
          />
          <el-button
            link
            type="primary"
            :icon="Edit"
            title="编辑"
            @click.stop="openEdit(row)"
          />
          <el-tooltip
            content="已停用"
            :disabled="row.status !== 'disabled'"
          >
            <el-button
              link
              type="danger"
              :icon="TurnOff"
              title="停用"
              :disabled="row.status === 'disabled'"
              @click.stop="disableRow(row)"
            />
          </el-tooltip>
        </template>
      </el-table-column>

      <template #empty>
        <EmptyState
          title="还没有渠道分组"
          description="先接入一个要反代的供应商（Cursor / Kiro / …），令牌绑定这个分组后按组内模型价扣费。"
        >
          <el-button
            type="primary"
            :icon="Plus"
            @click="openConnect"
          >
            接入供应商
          </el-button>
        </EmptyState>
      </template>
    </el-table>
  </FillListPageLayout>

  <VendorConnectDialog
    v-model:visible="connectVisible"
    @imported="fetchData()"
  />

  <SupplyGroupEditDialog
    v-model:visible="editVisible"
    :group="editing"
    @saved="fetchData()"
  />
</template>

<style scoped>
.filter-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.filter-bar__meta {
  margin-left: auto;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
.cell-group {
  display: flex;
  flex-direction: column;
  gap: 3px;
  line-height: 1.35;
}
.cell-group__name {
  font-weight: 600;
  color: var(--el-text-color-primary);
}
.cell-group__key {
  align-self: flex-start;
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 11px;
  color: var(--el-text-color-secondary);
  background: #f1f5f9;
  padding: 1px 6px;
  border-radius: 4px;
}
.cell-muted {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.num {
  font-variant-numeric: tabular-nums;
}
.num--warn {
  color: var(--el-color-warning);
  font-weight: 600;
}
</style>
