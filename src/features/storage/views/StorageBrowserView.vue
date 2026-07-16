<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import {
  ArrowLeft,
  ArrowUp,
  Folder,
  Grid,
  List,
  Lock,
  Refresh,
  VideoCamera,
} from '@element-plus/icons-vue';

import EmptyState from '@/shared/ui/EmptyState.vue';
import SettingsPanelShell from '@/shared/ui/SettingsPanelShell.vue';
import { usePagination } from '@/shared/composables/usePagination';
import { formatBytes } from '@/shared/lib/formatBytes';
import { formatDateTime } from '@/shared/lib/date';

import type { StorageObjectItem, StorageObjectRef } from '../model/storageObject.types';
import { productLabel, purposeLabel } from '../model/storageObject.types';
import { resolvePublicUrl } from '../lib/resolvePublicUrl';
import { getStorageAdminPort } from '../services';

const route = useRoute();
const router = useRouter();

const loading = ref(false);
const viewMode = ref<'grid' | 'list'>('list');
const folders = ref<string[]>([]);
const files = ref<StorageObjectItem[]>([]);
const currentPrefix = ref('');
const pagination = usePagination({ pageSize: 50 });

const drawer = ref(false);
const drawerLoading = ref(false);
const refsResult = ref<{ item: StorageObjectItem | null; refs: StorageObjectRef[] }>({
  item: null,
  refs: [],
});

const breadcrumbs = computed(() => {
  const segments: Array<{ label: string; path: string }> = [{ label: '根目录', path: '' }];
  if (!currentPrefix.value) return segments;
  const parts = currentPrefix.value.split('/').filter(Boolean);
  let acc = '';
  for (const part of parts) {
    acc += `${part}/`;
    segments.push({ label: part, path: acc });
  }
  return segments;
});

const isEmpty = computed(() => !loading.value && folders.value.length === 0 && files.value.length === 0);

const tableRows = computed(() => [
  ...folders.value.map((f) => ({ kind: 'folder' as const, id: `folder:${f}`, prefix: f })),
  ...files.value.map((f) => ({ kind: 'file' as const, id: `file:${f.id}`, item: f })),
]);

function folderName(prefix: string): string {
  const trimmed = prefix.endsWith('/') ? prefix.slice(0, -1) : prefix;
  const parts = trimmed.split('/');
  return parts[parts.length - 1] ?? prefix;
}

function fileName(item: StorageObjectItem): string {
  const key = item.storageKey;
  const relative = key.startsWith(currentPrefix.value)
    ? key.slice(currentPrefix.value.length)
    : key;
  return relative.split('/').pop() ?? key;
}

function isImage(item: StorageObjectItem): boolean {
  return item.mime.startsWith('image/');
}

function isVideo(item: StorageObjectItem): boolean {
  return item.mime.startsWith('video/');
}

function mimeLabel(mime: string): string {
  if (mime.startsWith('image/')) return '图片';
  if (mime.startsWith('video/')) return '视频';
  if (mime.startsWith('audio/')) return '音频';
  return mime || '文件';
}

async function copyText(text: string, label: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    ElMessage.success(`已复制${label}`);
  } catch {
    ElMessage.error('复制失败');
  }
}

function navigateToPrefix(prefix: string): void {
  pagination.setPage(1);
  void router.push({
    path: '/storage/browser',
    query: prefix ? { prefix } : {},
  });
}

function goUp(): void {
  const prefix = currentPrefix.value;
  if (!prefix) return;
  const trimmed = prefix.endsWith('/') ? prefix.slice(0, -1) : prefix;
  const idx = trimmed.lastIndexOf('/');
  navigateToPrefix(idx >= 0 ? `${trimmed.slice(0, idx + 1)}` : '');
}

function goBack(): void {
  if (window.history.length > 1) router.back();
  else navigateToPrefix('');
}

function applyRouteQuery(): void {
  const q = route.query.prefix;
  currentPrefix.value = typeof q === 'string' ? q : '';
}

async function load(): Promise<void> {
  loading.value = true;
  try {
    const r = await getStorageAdminPort().browseObjects({
      prefix: currentPrefix.value,
      page: pagination.state.page,
      pageSize: pagination.state.pageSize,
    });
    if (r.success) {
      folders.value = r.data.commonPrefixes;
      files.value = r.data.items;
      currentPrefix.value = r.data.prefix;
      pagination.setTotal(r.data.total);
    } else {
      ElMessage.error(r.error.message);
    }
  } finally {
    loading.value = false;
  }
}

async function openRefs(item: StorageObjectItem): Promise<void> {
  drawer.value = true;
  drawerLoading.value = true;
  refsResult.value = { item, refs: [] };
  try {
    const r = await getStorageAdminPort().getObjectRefs(item.storageKey);
    if (r.success && r.data.found) {
      refsResult.value = { item, refs: r.data.refs };
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
  return resolvePublicUrl(item.publicUrl);
});

function refStatusLabel(status: string): string {
  return status === 'released' ? '已释放' : status === 'committed' ? '引用中' : status;
}

function refStatusType(status: string): 'success' | 'info' {
  return status === 'released' ? 'info' : 'success';
}

watch(
  () => [pagination.state.page, pagination.state.pageSize],
  () => void load(),
);

watch(
  () => route.query.prefix,
  () => {
    applyRouteQuery();
    pagination.setPage(1);
    void load();
  },
);

onMounted(() => {
  applyRouteQuery();
  void load();
});
</script>

<template>
  <SettingsPanelShell
    title="文件浏览"
    description="按 Storage Key 路径层级浏览对象，类似文件夹导航"
  >
    <template #actions>
      <el-button :icon="ArrowLeft" text :disabled="!currentPrefix" @click="goBack">后退</el-button>
      <el-button :icon="ArrowUp" text :disabled="!currentPrefix" @click="goUp">上级</el-button>
      <el-button :icon="Refresh" text @click="load">刷新</el-button>
      <el-button-group>
        <el-button :type="viewMode === 'list' ? 'primary' : 'default'" :icon="List" @click="viewMode = 'list'" />
        <el-button :type="viewMode === 'grid' ? 'primary' : 'default'" :icon="Grid" @click="viewMode = 'grid'" />
      </el-button-group>
    </template>

    <div class="browser-toolbar">
      <el-breadcrumb separator="/">
        <el-breadcrumb-item
          v-for="(crumb, idx) in breadcrumbs"
          :key="crumb.path || 'root'"
        >
          <a
            v-if="idx < breadcrumbs.length - 1"
            href="#"
            class="browser-crumb"
            @click.prevent="navigateToPrefix(crumb.path)"
          >
            {{ crumb.label }}
          </a>
          <span v-else>{{ crumb.label }}</span>
        </el-breadcrumb-item>
      </el-breadcrumb>
      <div v-if="currentPrefix" class="browser-path mono">{{ currentPrefix }}</div>
    </div>

    <div v-loading="loading" class="browser-body">
      <EmptyState
        v-if="isEmpty"
        title="此目录为空"
        description="当前路径下没有子文件夹或文件。"
      />

      <!-- 列表视图 -->
      <div v-else-if="viewMode === 'list'" class="browser-list-wrap">
        <el-table
          :data="tableRows"
          row-key="id"
          size="small"
          class="compact-table browser-table"
          :empty-text="' '"
          @row-dblclick="(row: { kind: string; prefix?: string; item?: StorageObjectItem }) => {
            if (row.kind === 'folder' && row.prefix) navigateToPrefix(row.prefix);
            else if (row.item) openRefs(row.item);
          }"
        >
          <el-table-column label="名称" min-width="280">
            <template #default="{ row }">
              <div
                v-if="row.kind === 'folder'"
                class="browser-name browser-name--folder"
                @dblclick="navigateToPrefix(row.prefix)"
              >
                <el-icon :size="18"><Folder /></el-icon>
                <span>{{ folderName(row.prefix) }}</span>
              </div>
              <div
                v-else
                class="browser-name browser-name--file"
                @dblclick="openRefs(row.item)"
              >
                <el-image
                  v-if="row.item.publicUrl && isImage(row.item)"
                  :src="resolvePublicUrl(row.item.publicUrl)!"
                  fit="cover"
                  class="browser-name__thumb"
                />
                <el-icon v-else-if="isVideo(row.item)" :size="18"><VideoCamera /></el-icon>
                <el-icon v-else :size="18"><Lock /></el-icon>
                <span :title="row.item.storageKey">{{ fileName(row.item) }}</span>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="类型" width="100">
            <template #default="{ row }">
              {{ row.kind === 'folder' ? '文件夹' : mimeLabel(row.item.mime) }}
            </template>
          </el-table-column>
          <el-table-column label="大小" width="110" align="right">
            <template #default="{ row }">
              {{ row.kind === 'folder' ? '—' : formatBytes(row.item.size) }}
            </template>
          </el-table-column>
          <el-table-column label="修改时间" width="170">
            <template #default="{ row }">
              {{ row.kind === 'folder' ? '—' : formatDateTime(row.item.createdAtUtc) }}
            </template>
          </el-table-column>
          <el-table-column label="操作" width="120" fixed="right">
            <template #default="{ row }">
              <el-button
                v-if="row.kind === 'folder'"
                link
                type="primary"
                @click="navigateToPrefix(row.prefix)"
              >
                打开
              </el-button>
              <el-button v-else link type="primary" @click="openRefs(row.item)">详情</el-button>
            </template>
          </el-table-column>
        </el-table>
      </div>

      <!-- 网格视图 -->
      <div v-else class="browser-grid">
        <div
          v-for="folder in folders"
          :key="folder"
          class="browser-grid__item browser-grid__item--folder"
          @dblclick="navigateToPrefix(folder)"
        >
          <el-icon :size="40" class="browser-grid__icon"><Folder /></el-icon>
          <span class="browser-grid__label" :title="folder">{{ folderName(folder) }}</span>
        </div>
        <div
          v-for="item in files"
          :key="item.id"
          class="browser-grid__item browser-grid__item--file"
          @dblclick="openRefs(item)"
        >
          <el-image
            v-if="item.publicUrl && isImage(item)"
            :src="resolvePublicUrl(item.publicUrl)!"
            fit="cover"
            class="browser-grid__thumb"
          />
          <el-icon v-else-if="isVideo(item)" :size="36" class="browser-grid__icon"><VideoCamera /></el-icon>
          <el-icon v-else :size="36" class="browser-grid__icon"><Lock /></el-icon>
          <span class="browser-grid__label" :title="item.storageKey">{{ fileName(item) }}</span>
          <span class="browser-grid__meta">{{ formatBytes(item.size) }}</span>
        </div>
      </div>
    </div>

    <div v-if="files.length > 0 || pagination.state.total > 0" class="settings-panel__pagination">
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

  <el-drawer v-model="drawer" title="对象详情" size="640px">
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
              <el-button link type="primary" size="small" @click="copyText(refsResult.item!.storageKey, ' Storage Key')">
                复制
              </el-button>
            </div>
            <div class="meta-row">
              <span class="meta-label">SHA-256</span>
              <span class="meta-value mono">{{ refsResult.item.sha256 }}</span>
              <el-button link type="primary" size="small" @click="copyText(refsResult.item!.sha256, ' SHA-256')">
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
              <span class="meta-label">用户</span>
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
          <el-table-column label="RefKey" min-width="120">
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
        </el-table>
      </template>
    </div>
  </el-drawer>
</template>

<style scoped src="@/shared/ui/settings-panel.css"></style>

<style scoped>
.browser-toolbar {
  margin-bottom: 12px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.browser-crumb {
  color: var(--el-color-primary);
  text-decoration: none;
}

.browser-crumb:hover {
  text-decoration: underline;
}

.browser-path {
  margin-top: 6px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  word-break: break-all;
}

.mono {
  font-family: ui-monospace, monospace;
}

.browser-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
}

.browser-list-wrap {
  height: 100%;
}

.browser-table {
  height: 100%;
}

.browser-name {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: default;
  user-select: none;
}

.browser-name--folder {
  cursor: pointer;
  color: var(--el-color-primary);
}

.browser-name--file {
  cursor: pointer;
}

.browser-name__thumb {
  width: 28px;
  height: 28px;
  border-radius: 4px;
  flex-shrink: 0;
}

.browser-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 12px;
  padding: 4px 0;
}

.browser-grid__item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 12px 8px;
  border: 1px solid transparent;
  border-radius: 8px;
  cursor: pointer;
  user-select: none;
  transition: background-color 0.15s, border-color 0.15s;
}

.browser-grid__item:hover {
  background: var(--el-fill-color-light);
  border-color: var(--el-border-color-lighter);
}

.browser-grid__icon {
  color: var(--el-color-warning);
}

.browser-grid__thumb {
  width: 72px;
  height: 72px;
  border-radius: 6px;
}

.browser-grid__label {
  font-size: 12px;
  text-align: center;
  word-break: break-all;
  line-height: 1.3;
  max-width: 100%;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.browser-grid__meta {
  font-size: 11px;
  color: var(--el-text-color-secondary);
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

.refs-drawer__heading {
  margin: 0 0 12px;
  font-size: 14px;
  font-weight: 600;
}
</style>
