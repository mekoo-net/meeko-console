<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { ElMessage } from 'element-plus';
import { Lock, Refresh, VideoCamera } from '@element-plus/icons-vue';

import EmptyState from '@/shared/ui/EmptyState.vue';
import SettingsPanelShell from '@/shared/ui/SettingsPanelShell.vue';
import { usePagination } from '@/shared/composables/usePagination';
import { formatBytes } from '@/shared/lib/formatBytes';
import { formatDateTime } from '@/shared/lib/date';

import type { StorageObjectItem, StorageObjectRef } from '../model/storageObject.types';
import { productLabel, purposeLabel } from '../model/storageObject.types';
import { getStorageAdminPort } from '../services';

const route = useRoute();
const loading = ref(false);
const rows = ref<StorageObjectItem[]>([]);
const pagination = usePagination({ pageSize: 20 });

const filters = reactive({
  purpose: '',
  product: '',
  mimePrefix: '',
  status: '',
  accountUid: '',
  sha256: '',
  backendId: '',
});

function applyRouteQuery(): void {
  const q = route.query;
  filters.status = typeof q.status === 'string' ? q.status : '';
  filters.backendId = typeof q.backendId === 'string' ? q.backendId : '';
}

const drawer = ref(false);
const drawerLoading = ref(false);
const selectedKey = ref<string | null>(null);
const refsResult = ref<{
  item: StorageObjectItem | null;
  refs: StorageObjectRef[];
}>({ item: null, refs: [] });

const purposeOptions = [
  { value: '', label: '全部用途' },
  { value: 'avatar', label: '平台头像' },
  { value: 'persona-avatar', label: '角色头像' },
  { value: 'chat-image', label: '聊天图片' },
  { value: 'chat-video', label: '聊天视频' },
];

const productOptions = [
  { value: '', label: '全部产品' },
  { value: 'platform', label: '平台' },
  { value: 'tavern', label: 'Tavern' },
];

const mimeOptions = [
  { value: '', label: '全部类型' },
  { value: 'image/', label: '图片' },
  { value: 'video/', label: '视频' },
  { value: 'audio/', label: '音频' },
];

const statusOptions = [
  { value: '', label: '全部状态' },
  { value: 'committed', label: '正常' },
  { value: 'orphaned', label: '孤儿' },
];

function keyTail(key: string): string {
  const parts = key.split('/');
  return parts[parts.length - 1] ?? key;
}

function shaShort(sha: string): string {
  return sha.length > 12 ? `${sha.slice(0, 12)}…` : sha;
}

async function copyText(text: string, label: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    ElMessage.success(`已复制${label}`);
  } catch {
    ElMessage.error('复制失败');
  }
}

function isImage(row: StorageObjectItem): boolean {
  return row.mime.startsWith('image/');
}

function isVideo(row: StorageObjectItem): boolean {
  return row.mime.startsWith('video/');
}

function statusTag(row: StorageObjectItem): { label: string; type: 'success' | 'warning' } {
  return row.status === 'orphaned'
    ? { label: '孤儿', type: 'warning' }
    : { label: '正常', type: 'success' };
}

function refStatusLabel(status: string): string {
  return status === 'released' ? '已释放' : status === 'committed' ? '引用中' : status;
}

function refStatusType(status: string): 'success' | 'info' {
  return status === 'released' ? 'info' : 'success';
}

async function load(): Promise<void> {
  loading.value = true;
  try {
    const r = await getStorageAdminPort().listObjects({
      page: pagination.state.page,
      pageSize: pagination.state.pageSize,
      accountUid: filters.accountUid || undefined,
      product: filters.product || undefined,
      purpose: filters.purpose || undefined,
      sha256: filters.sha256 || undefined,
      mimePrefix: filters.mimePrefix || undefined,
      status: filters.status || undefined,
      backendId: filters.backendId || undefined,
    });
    if (r.success) {
      rows.value = r.data.items;
      pagination.setTotal(r.data.total);
    } else {
      ElMessage.error(r.error.message);
    }
  } finally {
    loading.value = false;
  }
}

function onSearch(): void {
  pagination.setPage(1);
  void load();
}

function onReset(): void {
  filters.purpose = '';
  filters.product = '';
  filters.mimePrefix = '';
  filters.status = '';
  filters.accountUid = '';
  filters.sha256 = '';
  filters.backendId = '';
  pagination.setPage(1);
  void load();
}

async function openRefs(row: StorageObjectItem): Promise<void> {
  selectedKey.value = row.storageKey;
  drawer.value = true;
  drawerLoading.value = true;
  refsResult.value = { item: row, refs: [] };
  try {
    const r = await getStorageAdminPort().getObjectRefs(row.storageKey);
    if (r.success && r.data.found) {
      refsResult.value = {
        item: row,
        refs: r.data.refs,
      };
    } else if (r.success) {
      ElMessage.warning('未找到对象引用');
    } else {
      ElMessage.error(r.error.message);
    }
  } finally {
    drawerLoading.value = false;
  }
}

const drawerPreviewUrl = computed(() => {
  const item = refsResult.value.item;
  if (!item?.publicUrl || !isImage(item)) return null;
  return item.publicUrl;
});

watch(
  () => [pagination.state.page, pagination.state.pageSize],
  () => void load(),
);

onMounted(() => {
  applyRouteQuery();
  void load();
});

watch(
  () => route.query,
  () => {
    applyRouteQuery();
    pagination.setPage(1);
    void load();
  },
);
</script>

<template>
  <SettingsPanelShell
    title="对象检索"
    description="跨路径检索存储对象，按用途/账户/哈希筛选并查看引用溯源"
  >
    <template #actions>
      <el-button :icon="Refresh" text @click="load">刷新</el-button>
    </template>

    <div class="storage-contents__filters">
      <el-select v-model="filters.purpose" placeholder="用途" clearable filterable style="width: 140px">
        <el-option
          v-for="opt in purposeOptions"
          :key="opt.value || 'all'"
          :label="opt.label"
          :value="opt.value"
        />
      </el-select>
      <el-select v-model="filters.product" placeholder="产品" clearable style="width: 120px">
        <el-option
          v-for="opt in productOptions"
          :key="opt.value || 'all'"
          :label="opt.label"
          :value="opt.value"
        />
      </el-select>
      <el-select v-model="filters.mimePrefix" placeholder="类型" clearable style="width: 110px">
        <el-option
          v-for="opt in mimeOptions"
          :key="opt.value || 'all'"
          :label="opt.label"
          :value="opt.value"
        />
      </el-select>
      <el-select v-model="filters.status" placeholder="状态" clearable style="width: 110px">
        <el-option
          v-for="opt in statusOptions"
          :key="opt.value || 'all'"
          :label="opt.label"
          :value="opt.value"
        />
      </el-select>
      <el-input
        v-model="filters.accountUid"
        placeholder="账户 UID"
        clearable
        style="width: 130px"
      />
      <el-input
        v-model="filters.sha256"
        placeholder="SHA-256 前缀"
        clearable
        style="width: 180px"
      />
      <el-button type="primary" @click="onSearch">查询</el-button>
      <el-button @click="onReset">重置</el-button>
    </div>

    <div class="settings-panel__table-wrap">
      <el-table
        v-loading="loading"
        :data="rows"
        row-key="id"
        size="small"
        class="compact-table"
        height="100%"
        :empty-text="' '"
      >
        <el-table-column label="预览" width="72" align="center">
          <template #default="{ row }: { row: StorageObjectItem }">
            <div class="preview-cell" @click="openRefs(row)">
              <el-image
                v-if="row.publicUrl && isImage(row)"
                :src="row.publicUrl"
                :preview-src-list="[row.publicUrl]"
                :preview-teleported="true"
                fit="cover"
                lazy
                class="preview-thumb"
                @click.stop
              />
              <el-tooltip v-else-if="isVideo(row)" content="视频文件">
                <el-icon :size="24"><VideoCamera /></el-icon>
              </el-tooltip>
              <el-tooltip v-else content="私密文件，不提供预览">
                <el-icon :size="24"><Lock /></el-icon>
              </el-tooltip>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="对象" min-width="200">
          <template #default="{ row }: { row: StorageObjectItem }">
            <div class="cell-product">
              <span class="cell-product__name" :title="row.storageKey">{{ keyTail(row.storageKey) }}</span>
              <span class="cell-product__code">{{ row.mime }}</span>
            </div>
            <div class="sha-row">
              <span class="sha-row__text" :title="row.sha256">{{ shaShort(row.sha256) }}</span>
              <el-button
                link
                type="primary"
                size="small"
                @click="copyText(row.sha256, ' SHA-256')"
              >
                复制
              </el-button>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="大小" width="100" align="right">
          <template #default="{ row }: { row: StorageObjectItem }">
            {{ formatBytes(row.size) }}
          </template>
        </el-table-column>

        <el-table-column label="首传者" width="100">
          <template #default="{ row }: { row: StorageObjectItem }">
            {{ row.createdByUid }}
          </template>
        </el-table-column>

        <el-table-column label="途径" min-width="160">
          <template #default="{ row }: { row: StorageObjectItem }">
            <div class="purpose-tags">
              <el-tag
                v-for="p in row.purposes"
                :key="p"
                size="small"
                round
              >
                {{ purposeLabel(p) }}
              </el-tag>
            </div>
            <div class="product-hint">
              {{ row.products.map(productLabel).join(' · ') }}
            </div>
          </template>
        </el-table-column>

        <el-table-column label="引用" width="90" align="center">
          <template #default="{ row }: { row: StorageObjectItem }">
            {{ row.activeRefCount }} / {{ row.totalRefCount }}
          </template>
        </el-table-column>

        <el-table-column label="状态" width="80" align="center">
          <template #default="{ row }: { row: StorageObjectItem }">
            <el-tag :type="statusTag(row).type" size="small" round>
              {{ statusTag(row).label }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column label="创建时间" min-width="160">
          <template #default="{ row }: { row: StorageObjectItem }">
            {{ formatDateTime(row.createdAtUtc) }}
          </template>
        </el-table-column>

        <el-table-column label="操作" width="100" fixed="right">
          <template #default="{ row }: { row: StorageObjectItem }">
            <el-button link type="primary" @click="openRefs(row)">查看引用</el-button>
          </template>
        </el-table-column>

        <template #empty>
          <EmptyState
            title="暂无存储对象"
            description="调整筛选条件或等待用户上传内容。"
          />
        </template>
      </el-table>
    </div>

    <div class="settings-panel__pagination">
      <el-pagination
        v-model:current-page="pagination.state.page"
        v-model:page-size="pagination.state.pageSize"
        :total="pagination.state.total"
        :page-sizes="pagination.pageSizes"
        layout="total, sizes, prev, pager, next"
        background
      />
    </div>
  </SettingsPanelShell>

  <el-drawer
    v-model="drawer"
    title="引用溯源"
    size="640px"
  >
    <div v-loading="drawerLoading" class="refs-drawer">
      <template v-if="refsResult.item">
        <div class="refs-drawer__card">
          <div v-if="drawerPreviewUrl" class="refs-drawer__preview">
            <el-image
              :src="drawerPreviewUrl"
              :preview-src-list="[drawerPreviewUrl]"
              :preview-teleported="true"
              fit="contain"
              class="refs-drawer__image"
            />
          </div>
          <div class="refs-drawer__meta">
            <div class="meta-row">
              <span class="meta-label">Storage Key</span>
              <span class="meta-value" :title="refsResult.item.storageKey">
                {{ refsResult.item.storageKey }}
              </span>
              <el-button
                link
                type="primary"
                size="small"
                @click="copyText(refsResult.item!.storageKey, ' Storage Key')"
              >
                复制
              </el-button>
            </div>
            <div class="meta-row">
              <span class="meta-label">SHA-256</span>
              <span class="meta-value mono">{{ refsResult.item.sha256 }}</span>
              <el-button
                link
                type="primary"
                size="small"
                @click="copyText(refsResult.item!.sha256, ' SHA-256')"
              >
                复制
              </el-button>
            </div>
            <div class="meta-row">
              <span class="meta-label">MIME</span>
              <span class="meta-value">{{ refsResult.item.mime }}</span>
            </div>
            <div class="meta-row">
              <span class="meta-label">大小</span>
              <span class="meta-value">{{ formatBytes(refsResult.item.size) }}</span>
            </div>
            <div class="meta-row">
              <span class="meta-label">首传者</span>
              <span class="meta-value">{{ refsResult.item.createdByUid }}</span>
            </div>
            <div class="meta-row">
              <span class="meta-label">创建时间</span>
              <span class="meta-value">{{ formatDateTime(refsResult.item.createdAtUtc) }}</span>
            </div>
          </div>
        </div>

        <h4 class="refs-drawer__heading">引用记录（{{ refsResult.refs.length }}）</h4>
        <el-table :data="refsResult.refs" size="small" class="compact-table">
          <el-table-column label="账户 UID" prop="accountUid" width="100" />
          <el-table-column label="产品" width="90">
            <template #default="{ row }: { row: StorageObjectRef }">
              {{ productLabel(row.product) }}
            </template>
          </el-table-column>
          <el-table-column label="用途" width="110">
            <template #default="{ row }: { row: StorageObjectRef }">
              <el-tag size="small" round>{{ purposeLabel(row.purpose) }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="RefKey" prop="refKey" min-width="120">
            <template #default="{ row }: { row: StorageObjectRef }">
              {{ row.refKey ?? '—' }}
            </template>
          </el-table-column>
          <el-table-column label="状态" width="90">
            <template #default="{ row }: { row: StorageObjectRef }">
              <el-tag :type="refStatusType(row.status)" size="small" round>
                {{ refStatusLabel(row.status) }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="引用时间" min-width="150">
            <template #default="{ row }: { row: StorageObjectRef }">
              {{ formatDateTime(row.createdAtUtc) }}
            </template>
          </el-table-column>
          <el-table-column label="最近活跃" min-width="150">
            <template #default="{ row }: { row: StorageObjectRef }">
              {{ formatDateTime(row.lastSeenAtUtc) }}
            </template>
          </el-table-column>
          <el-table-column label="释放时间" min-width="150">
            <template #default="{ row }: { row: StorageObjectRef }">
              {{ row.releasedAtUtc ? formatDateTime(row.releasedAtUtc) : '—' }}
            </template>
          </el-table-column>
        </el-table>
      </template>
    </div>
  </el-drawer>
</template>

<style scoped src="@/shared/ui/settings-panel.css"></style>

<style scoped>
.storage-contents__filters {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
  align-items: center;
}

.preview-cell {
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  min-height: 48px;
}

.preview-thumb {
  width: 48px;
  height: 48px;
  border-radius: 4px;
}

.sha-row {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 2px;
}

.sha-row__text {
  font-size: 11px;
  color: var(--el-text-color-secondary);
  font-family: ui-monospace, monospace;
}

.purpose-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.product-hint {
  font-size: 11px;
  color: var(--el-text-color-secondary);
  margin-top: 4px;
}

.refs-drawer__card {
  display: flex;
  gap: 16px;
  margin-bottom: 20px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.refs-drawer__preview {
  flex-shrink: 0;
}

.refs-drawer__image {
  width: 160px;
  height: 160px;
  border-radius: 8px;
  border: 1px solid var(--el-border-color-lighter);
}

.refs-drawer__meta {
  flex: 1;
  min-width: 0;
}

.meta-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 8px;
  font-size: 13px;
}

.meta-label {
  flex-shrink: 0;
  width: 88px;
  color: var(--el-text-color-secondary);
}

.meta-value {
  flex: 1;
  min-width: 0;
  word-break: break-all;
}

.meta-value.mono {
  font-family: ui-monospace, monospace;
  font-size: 12px;
}

.refs-drawer__heading {
  margin: 0 0 12px;
  font-size: 14px;
  font-weight: 600;
}
</style>
