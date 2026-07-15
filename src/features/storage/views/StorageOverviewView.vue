<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { FolderOpened, Picture, Plus, Refresh } from '@element-plus/icons-vue';

import EmptyState from '@/shared/ui/EmptyState.vue';
import SettingsPanelShell from '@/shared/ui/SettingsPanelShell.vue';
import { clientPaginate, usePagination } from '@/shared/composables/usePagination';
import { formatBytes } from '@/shared/lib/formatBytes';

import type { StorageBackendUsage, StorageOverview } from '../model/storageOverview.types';
import { getStorageAdminPort } from '../services';

const router = useRouter();
const loading = ref(false);
const overview = ref<StorageOverview | null>(null);
const pagination = usePagination({ pageSize: 20 });

const rows = computed(() => overview.value?.backends ?? []);
const displayRows = computed(() =>
  clientPaginate(rows.value, pagination.state.page, pagination.state.pageSize),
);

function providerLabel(type: string): string {
  return type === 'local' ? '本地磁盘' : type === 'aliyun-oss' ? '阿里云 OSS' : type;
}

function statusTags(row: StorageBackendUsage): Array<{ label: string; type: 'success' | 'info' | 'warning' | 'danger' }> {
  const tags: Array<{ label: string; type: 'success' | 'info' | 'warning' | 'danger' }> = [];
  if (row.isDefault) tags.push({ label: '默认', type: 'success' });
  tags.push({ label: row.isActive ? '已启用' : '已停用', type: row.isActive ? 'success' : 'info' });
  if (row.orphanedCount > 0) tags.push({ label: `孤儿 ${row.orphanedCount}`, type: 'warning' });
  if (row.pendingUploadCount > 0) tags.push({ label: `待确认 ${row.pendingUploadCount}`, type: 'warning' });
  return tags;
}

async function load(): Promise<void> {
  loading.value = true;
  try {
    const r = await getStorageAdminPort().getOverview();
    if (r.success) {
      overview.value = r.data;
      pagination.setTotal(r.data.backends.length);
    } else {
      ElMessage.error(r.error.message);
    }
  } finally {
    loading.value = false;
  }
}

function goCreateBackend(): void {
  void router.push('/storage/backends');
}

function goBrowser(prefix?: string): void {
  void router.push(prefix ? { path: '/storage/browser', query: { prefix } } : '/storage/browser');
}

function goContents(opts?: { status?: string; backendId?: string }): void {
  const query: Record<string, string> = {};
  if (opts?.status) query.status = opts.status;
  if (opts?.backendId) query.backendId = opts.backendId;
  void router.push(
    Object.keys(query).length > 0 ? { path: '/storage/contents', query } : '/storage/contents',
  );
}

function goBackends(): void {
  void router.push('/storage/backends');
}

onMounted(() => load());
</script>

<template>
  <SettingsPanelShell
    title="存储概览"
    description="查看各存储后端的用量、引用与运行状态"
  >
    <template #actions>
      <el-button :icon="Refresh" text @click="load">刷新</el-button>
      <el-button :icon="FolderOpened" @click="goBrowser()">文件浏览</el-button>
      <el-button :icon="Picture" @click="goContents()">对象检索</el-button>
      <el-button type="primary" :icon="Plus" @click="goCreateBackend">新建后端</el-button>
    </template>

    <div v-loading="loading" class="settings-panel__stats">
      <div class="settings-panel__stat settings-panel__stat--clickable" @click="goBackends">
        <div class="settings-panel__stat-label">存储后端</div>
        <div class="settings-panel__stat-value">
          {{ overview?.activeBackendCount ?? 0 }} / {{ overview?.backendCount ?? 0 }}
        </div>
      </div>
      <div class="settings-panel__stat settings-panel__stat--clickable" @click="goContents()">
        <div class="settings-panel__stat-label">对象数</div>
        <div class="settings-panel__stat-value">{{ overview?.totalObjectCount ?? 0 }}</div>
      </div>
      <div class="settings-panel__stat settings-panel__stat--clickable" @click="goContents()">
        <div class="settings-panel__stat-label">总用量</div>
        <div class="settings-panel__stat-value">{{ formatBytes(overview?.totalBytes ?? 0) }}</div>
      </div>
      <div class="settings-panel__stat settings-panel__stat--clickable" @click="goContents()">
        <div class="settings-panel__stat-label">活跃引用</div>
        <div class="settings-panel__stat-value">{{ overview?.activeRefCount ?? 0 }}</div>
      </div>
      <div
        class="settings-panel__stat settings-panel__stat--clickable"
        @click="goContents({ status: 'orphaned' })"
      >
        <div class="settings-panel__stat-label">孤儿对象</div>
        <div class="settings-panel__stat-value">{{ overview?.orphanedObjectCount ?? 0 }}</div>
      </div>
      <div class="settings-panel__stat">
        <div class="settings-panel__stat-label">待确认上传</div>
        <div class="settings-panel__stat-value">{{ overview?.pendingUploadCount ?? 0 }}</div>
      </div>
    </div>

    <div class="settings-panel__table-wrap">
      <el-table
        :data="displayRows"
        row-key="backendId"
        size="small"
        class="compact-table"
        height="100%"
        :empty-text="' '"
      >
        <el-table-column label="后端" min-width="180">
          <template #default="{ row }: { row: StorageBackendUsage }">
            <div class="cell-product">
              <span class="cell-product__name">{{ row.name }}</span>
              <span class="cell-product__code">{{ providerLabel(row.providerType) }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="状态" min-width="200">
          <template #default="{ row }: { row: StorageBackendUsage }">
            <div class="status-tags">
              <el-tag
                v-for="tag in statusTags(row)"
                :key="tag.label"
                :type="tag.type"
                size="small"
                round
              >
                {{ tag.label }}
              </el-tag>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="对象数" width="100" align="right">
          <template #default="{ row }: { row: StorageBackendUsage }">{{ row.objectCount }}</template>
        </el-table-column>
        <el-table-column label="用量" width="120" align="right">
          <template #default="{ row }: { row: StorageBackendUsage }">
            {{ formatBytes(row.totalBytes) }}
          </template>
        </el-table-column>
        <el-table-column label="活跃引用" width="100" align="right">
          <template #default="{ row }: { row: StorageBackendUsage }">{{ row.activeRefCount }}</template>
        </el-table-column>
        <el-table-column label="孤儿对象" width="100" align="right">
          <template #default="{ row }: { row: StorageBackendUsage }">{{ row.orphanedCount }}</template>
        </el-table-column>
        <el-table-column label="待确认" width="90" align="right">
          <template #default="{ row }: { row: StorageBackendUsage }">{{ row.pendingUploadCount }}</template>
        </el-table-column>
        <el-table-column label="操作" width="120" fixed="right">
          <template #default="{ row }: { row: StorageBackendUsage }">
            <el-button link type="primary" @click="goContents({ backendId: row.backendId })">
              对象
            </el-button>
            <el-button link @click="goBackends">配置</el-button>
          </template>
        </el-table-column>

        <template #empty>
          <EmptyState
            title="暂无存储后端"
            description="请前往「存储后端」创建第一个对象存储后端。"
          >
            <el-button type="primary" @click="goCreateBackend">去创建</el-button>
          </EmptyState>
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
</template>

<style scoped src="@/shared/ui/settings-panel.css"></style>

<style scoped>
.status-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.settings-panel__stat--clickable {
  cursor: pointer;
  transition: background-color 0.15s;
  border-radius: 6px;
}

.settings-panel__stat--clickable:hover {
  background: var(--el-fill-color-light);
}
</style>
