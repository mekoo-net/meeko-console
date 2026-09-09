<script setup lang="ts">
/**
 * 接入供应商：从网关拉当前能服务的供应商与模型，左栏选供应商（分页 + 搜索），右栏勾选要接入的模型。
 * 一个供应商只落成一个分组，分组 key = vendor_key；接入后不关弹窗，可继续接下一个。
 */
import { computed, reactive, ref, watch } from 'vue';
import { Check, CircleCheck, Download, Refresh, Search } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';

import EmptyState from '@/shared/ui/EmptyState.vue';
import WorkspaceDetailPanel from '@/shared/ui/workspace/WorkspaceDetailPanel.vue';
import { clientPaginate, usePagination } from '@/shared/composables/usePagination';
import { formatDateTime } from '@/shared/lib/date';
import '@/shared/ui/workspace/workspace.css';

import { ChannelBillingKindLabel, resolveChannel } from '../model/channel.types';
import type { DiscoveredVendor, DiscoveredVendorModel } from '../model/vendor.types';
import { getToApiPricingPort } from '../services';

const visible = defineModel<boolean>('visible', { required: true });
const emit = defineEmits<{ (e: 'imported'): void }>();

const port = getToApiPricingPort();

const discovering = ref(false);
const importing = ref(false);
const discoveredAtUtc = ref<number | null>(null);
const vendors = ref<DiscoveredVendor[]>([]);

const selectedKey = ref('');
const vendorKeyword = ref('');
const modelKeyword = ref('');
const groupName = ref('');

/** key = `${vendorKey}::${vendorModel}` */
const checked = reactive<Record<string, boolean>>({});

const vendorPagination = usePagination({ pageSize: 10, pageSizes: [10, 20, 50] });
const modelPagination = usePagination({ pageSize: 20, pageSizes: [10, 20, 50, 100] });

const filteredVendors = computed(() => {
  const kw = vendorKeyword.value.trim().toLowerCase();
  if (!kw) return vendors.value;
  return vendors.value.filter((v) => {
    const ch = resolveChannel(v.vendorKey);
    return (
      v.vendorKey.toLowerCase().includes(kw) ||
      v.displayName.toLowerCase().includes(kw) ||
      (ch?.protocol.toLowerCase().includes(kw) ?? false)
    );
  });
});

const pagedVendors = computed(() =>
  clientPaginate(filteredVendors.value, vendorPagination.state.page, vendorPagination.state.pageSize),
);

const selected = computed(() => vendors.value.find((v) => v.vendorKey === selectedKey.value) ?? null);
const selectedChannel = computed(() => (selected.value ? resolveChannel(selected.value.vendorKey) : null));

const filteredModels = computed<DiscoveredVendorModel[]>(() => {
  const v = selected.value;
  if (!v) return [];
  const kw = modelKeyword.value.trim().toLowerCase();
  if (!kw) return v.models;
  return v.models.filter((m) => m.vendorModel.toLowerCase().includes(kw));
});

const pagedModels = computed(() =>
  clientPaginate(filteredModels.value, modelPagination.state.page, modelPagination.state.pageSize),
);

const pendingCount = computed(() => selected.value?.models.filter((m) => !m.alreadyImported).length ?? 0);
const checkedCount = computed(() => {
  const v = selected.value;
  if (!v) return 0;
  return v.models.reduce((acc, m) => acc + (isChecked(v.vendorKey, m.vendorModel) ? 1 : 0), 0);
});

const canImport = computed(() => {
  const v = selected.value;
  if (!v || checkedCount.value === 0) return false;
  return v.alreadyImported || groupName.value.trim().length > 0;
});

function key(vendorKey: string, vendorModel: string): string {
  return `${vendorKey}::${vendorModel}`;
}
function isChecked(vendorKey: string, vendorModel: string): boolean {
  return Boolean(checked[key(vendorKey, vendorModel)]);
}
function toggle(vendorKey: string, vendorModel: string, v: boolean): void {
  checked[key(vendorKey, vendorModel)] = v;
}
function checkAllPending(): void {
  const v = selected.value;
  if (!v) return;
  for (const m of v.models) if (!m.alreadyImported) checked[key(v.vendorKey, m.vendorModel)] = true;
}
function clearChecked(): void {
  const v = selected.value;
  if (!v) return;
  for (const m of v.models) delete checked[key(v.vendorKey, m.vendorModel)];
}

function ensureSelection(): void {
  const list = filteredVendors.value;
  if (list.length === 0) {
    selectedKey.value = '';
    return;
  }
  if (!list.some((v) => v.vendorKey === selectedKey.value)) {
    selectedKey.value = (list.find((v) => !v.alreadyImported) ?? list[0]!).vendorKey;
  }
}

async function runDiscover(opts?: { silent?: boolean }): Promise<void> {
  discovering.value = true;
  try {
    const r = await port.discoverVendors();
    if (!r.success) {
      if (!opts?.silent) ElMessage.error(r.error.message);
      return;
    }
    vendors.value = r.data.vendors;
    discoveredAtUtc.value = r.data.discoveredAtUtc;
    ensureSelection();
    if (!opts?.silent) {
      const total = r.data.vendors.reduce((acc, v) => acc + v.models.length, 0);
      ElMessage.success(`已从网关拉取 ${r.data.vendors.length} 个供应商、${total} 个模型`);
    }
  } finally {
    discovering.value = false;
  }
}

async function onImport(): Promise<void> {
  const v = selected.value;
  if (!v || !canImport.value) return;
  const models = v.models.filter((m) => isChecked(v.vendorKey, m.vendorModel)).map((m) => m.vendorModel);
  importing.value = true;
  try {
    const r = await port.importVendor({
      vendorKey: v.vendorKey,
      name: v.alreadyImported ? null : groupName.value.trim(),
      models,
    });
    if (!r.success) {
      ElMessage.error(r.error.message);
      return;
    }
    ElMessage.success(
      r.data.importedModelCount > 0
        ? `已接入 ${r.data.importedModelCount} 个模型（分组：${r.data.vendorKey}）`
        : `分组「${r.data.vendorKey}」已是最新，无新增模型`,
    );
    clearChecked();
    await runDiscover({ silent: true });
    emit('imported');
  } finally {
    importing.value = false;
  }
}

function reset(): void {
  vendors.value = [];
  discoveredAtUtc.value = null;
  selectedKey.value = '';
  vendorKeyword.value = '';
  modelKeyword.value = '';
  groupName.value = '';
  for (const k of Object.keys(checked)) delete checked[k];
  vendorPagination.reset();
  modelPagination.reset();
}

watch(filteredVendors, (list) => {
  vendorPagination.setTotal(list.length);
  ensureSelection();
}, { immediate: true });

watch(vendorKeyword, () => vendorPagination.setPage(1));

watch(filteredModels, (list) => modelPagination.setTotal(list.length), { immediate: true });
watch(modelKeyword, () => modelPagination.setPage(1));

watch(selectedKey, () => {
  modelKeyword.value = '';
  modelPagination.setPage(1);
  groupName.value = selected.value?.displayName ?? '';
});

watch(visible, (open) => {
  if (open) void runDiscover({ silent: true });
  else reset();
});
</script>

<template>
  <el-dialog
    v-model="visible"
    title="接入供应商"
    class="vendor-connect-dialog"
    width="min(1200px, 96vw)"
    top="4vh"
    :close-on-click-modal="false"
    destroy-on-close
    append-to-body
  >
    <p class="vendor-connect-dialog__desc">
      从网关拉取当前能服务的供应商与模型，勾选后接入。一个供应商只落成一个分组（key = vendor_key），令牌绑定它计费；接入后可继续接其它供应商。
    </p>

    <div class="vendor-connect-dialog__actions">
      <span
        v-if="discoveredAtUtc"
        class="vendor-connect-dialog__meta"
      >
        上次拉取：{{ formatDateTime(discoveredAtUtc) }}
      </span>
      <el-button
        type="primary"
        :icon="Refresh"
        :loading="discovering"
        @click="runDiscover()"
      >
        重新拉取
      </el-button>
    </div>

    <div
      v-loading="discovering && vendors.length === 0"
      class="vendor-connect-dialog__workspace"
    >
      <aside class="provider-sidebar">
        <div class="provider-sidebar__toolbar">
          <el-input
            v-model="vendorKeyword"
            :prefix-icon="Search"
            placeholder="搜索供应商 / 协议"
            clearable
            size="small"
          />
        </div>

        <div
          v-if="pagedVendors.length > 0"
          class="provider-sidebar__list"
        >
          <button
            v-for="v in pagedVendors"
            :key="v.vendorKey"
            type="button"
            class="provider-sidebar__item"
            :class="{ 'provider-sidebar__item--active': selectedKey === v.vendorKey }"
            @click="selectedKey = v.vendorKey"
          >
            <div class="provider-sidebar__item-head">
              <span class="provider-sidebar__item-title">{{ v.displayName }}</span>
              <el-tag
                v-if="v.alreadyImported"
                size="small"
                effect="plain"
                type="success"
              >
                已接入
              </el-tag>
              <el-tag
                v-else
                size="small"
                effect="plain"
                type="warning"
              >
                未接入
              </el-tag>
            </div>
            <span class="provider-sidebar__item-qg">{{ v.vendorKey }}</span>
            <div class="provider-sidebar__item-meta">
              <span>{{ v.models.length }} 个模型</span>
              <span>可接入 {{ v.models.filter((m) => !m.alreadyImported).length }}</span>
            </div>
          </button>
        </div>
        <EmptyState
          v-else-if="!discovering"
          :title="vendorKeyword ? '无匹配供应商' : '尚未从网关拉取数据'"
          description="点击「重新拉取」从网关获取清单。"
          class="provider-sidebar__empty"
        />

        <div
          v-if="filteredVendors.length > 0"
          class="provider-pagination provider-pagination--compact"
        >
          <el-pagination
            v-model:current-page="vendorPagination.state.page"
            v-model:page-size="vendorPagination.state.pageSize"
            :total="vendorPagination.state.total"
            :page-sizes="vendorPagination.pageSizes"
            layout="total, prev, pager, next"
            size="small"
            background
          />
        </div>
      </aside>

      <WorkspaceDetailPanel v-if="selected">
        <template #header>
          <div class="detail-header__main">
            <h2 class="provider-detail__title">
              {{ selected.displayName }}
            </h2>
            <p class="provider-detail__sub">
              {{ selected.vendorKey }}
            </p>
            <div class="provider-detail__stats">
              <span v-if="selectedChannel">{{ selectedChannel.protocol }}</span>
              <span v-if="selectedChannel">
                {{ ChannelBillingKindLabel[selectedChannel.billingKind] }} · {{ selectedChannel.priceHint }}
              </span>
              <span>{{ selected.models.length }} 个模型</span>
              <span>可接入 {{ pendingCount }}</span>
              <span>已勾选 {{ checkedCount }}</span>
            </div>
          </div>
          <div class="detail-actions">
            <el-button
              :icon="Check"
              plain
              :disabled="pendingCount === 0"
              @click="checkAllPending"
            >
              勾选全部未接入
            </el-button>
            <el-button
              plain
              :disabled="checkedCount === 0"
              @click="clearChecked"
            >
              清空勾选
            </el-button>
            <el-button
              type="primary"
              :icon="Download"
              :loading="importing"
              :disabled="!canImport"
              @click="onImport"
            >
              {{ selected.alreadyImported ? '补充模型' : '接入并继续' }} ({{ checkedCount }})
            </el-button>
          </div>
        </template>

        <template #toolbar>
          <div class="connect-toolbar">
            <div
              v-if="!selected.alreadyImported"
              class="connect-name-field"
            >
              <label class="connect-name-label">分组显示名 <span class="required">*</span></label>
              <el-input
                v-model="groupName"
                maxlength="96"
                placeholder="定价页原样显示"
                clearable
                style="max-width: 320px"
              />
              <p class="connect-name-hint">
                分组 key 固定为 <code>{{ selected.vendorKey }}</code>，建后不可改。
              </p>
            </div>
            <el-alert
              v-else
              type="success"
              show-icon
              :closable="false"
              title="该供应商已接入"
              description="勾选新增模型可补进同一分组；改名、改状态回列表页编辑。"
              class="connect-alert"
            />
            <el-input
              v-model="modelKeyword"
              :prefix-icon="Search"
              placeholder="搜索模型 ID"
              clearable
              style="max-width: 320px"
            />
          </div>
        </template>

        <div class="provider-detail__table-wrap">
          <el-table
            :data="pagedModels"
            row-key="vendorModel"
            size="small"
            class="compact-table"
            height="100%"
            :empty-text="' '"
          >
            <el-table-column
              label=""
              width="48"
              align="center"
            >
              <template #default="{ row: m }: { row: DiscoveredVendorModel }">
                <el-checkbox
                  :model-value="isChecked(selectedKey, m.vendorModel)"
                  :disabled="m.alreadyImported"
                  @change="(v) => toggle(selectedKey, m.vendorModel, Boolean(v))"
                />
              </template>
            </el-table-column>
            <el-table-column
              label="模型"
              min-width="280"
            >
              <template #default="{ row: m }: { row: DiscoveredVendorModel }">
                <span class="mono">{{ m.vendorModel }}</span>
              </template>
            </el-table-column>
            <el-table-column
              label="状态"
              width="120"
            >
              <template #default="{ row: m }: { row: DiscoveredVendorModel }">
                <el-tag
                  v-if="m.alreadyImported"
                  size="small"
                  effect="plain"
                  type="success"
                >
                  <el-icon><CircleCheck /></el-icon>
                  已接入
                </el-tag>
                <el-tag
                  v-else
                  size="small"
                  effect="plain"
                  type="info"
                >
                  待接入
                </el-tag>
              </template>
            </el-table-column>
            <template #empty>
              <EmptyState
                :title="modelKeyword ? '无匹配模型' : '该供应商暂无模型'"
                :description="modelKeyword ? '换个关键词或清空搜索。' : '网关此刻报告为空，可换供应商或重新拉取。'"
              />
            </template>
          </el-table>
        </div>
        <div class="provider-pagination">
          <el-pagination
            v-model:current-page="modelPagination.state.page"
            v-model:page-size="modelPagination.state.pageSize"
            :total="modelPagination.state.total"
            :page-sizes="modelPagination.pageSizes"
            layout="total, sizes, prev, pager, next"
            background
          />
        </div>
      </WorkspaceDetailPanel>

      <WorkspaceDetailPanel
        v-else
        show-placeholder
        placeholder-hint="选择左侧供应商开始接入"
      >
        <template #placeholder>
          <EmptyState
            title="选择左侧供应商开始接入"
            description="点击左栏一个供应商，右侧勾选要接入的模型；可连续操作多组。"
          />
        </template>
      </WorkspaceDetailPanel>
    </div>
  </el-dialog>
</template>

<style scoped>
.vendor-connect-dialog__desc {
  margin: 0 0 12px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
  line-height: 1.5;
}
.vendor-connect-dialog__actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  margin-bottom: 12px;
}
.vendor-connect-dialog__meta {
  margin-right: auto;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.vendor-connect-dialog__workspace {
  display: flex;
  gap: 16px;
  align-items: stretch;
  height: min(68vh, 640px);
  min-height: 420px;
}
.detail-header__main {
  flex: 1;
  min-width: 0;
}
.detail-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.connect-toolbar {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  flex-wrap: wrap;
}
.connect-name-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.connect-name-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--el-text-color-regular);
}
.connect-name-label .required {
  color: var(--el-color-danger);
  margin-left: 2px;
}
.connect-name-hint {
  margin: 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.connect-name-hint code {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
}
.connect-alert {
  flex: 1;
  min-width: 280px;
}
.mono {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-weight: 500;
}
</style>

<style>
.vendor-connect-dialog .el-dialog__body {
  padding-top: 8px;
}
</style>
