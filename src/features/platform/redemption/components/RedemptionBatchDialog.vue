<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { Delete, Download, EditPen, Lock, TopRight, Unlock } from '@element-plus/icons-vue';

import StatusTag from '@/shared/ui/StatusTag.vue';
import { formatDateTime } from '@/shared/lib/date';
import { formatMoney } from '@/shared/lib/money';

import { useRedemptionActions } from '../composables/useRedemptionActions';
import {
  batchDisplayStatus,
  BatchEventActionLabel,
  batchUnusedCount,
  canExportBatch,
  RedemptionPurposeLabel,
  type BatchEvent,
  type BatchEventAction,
  type KeysPayload,
  type PlainMode,
  type RedemptionBatch,
  type RedemptionCode,
} from '../model/redemption.types';
import { getRedemptionPort } from '../services';
import RedemptionCodeDrawer from './RedemptionCodeDrawer.vue';
import RedemptionCodesPanel from './RedemptionCodesPanel.vue';

const visible = defineModel<boolean>('visible', { required: true });
const props = defineProps<{ batch: RedemptionBatch | null }>();
const emit = defineEmits<{
  (e: 'plain', payload: KeysPayload, mode: PlainMode): void;
  (e: 'edit', batch: RedemptionBatch): void;
  (e: 'changed', batch: RedemptionBatch): void;
}>();

const router = useRouter();
const port = getRedemptionPort();
const actions = useRedemptionActions();

/** 弹窗里的动作会改批次，就地持有一份最新的，不依赖父组件回传。 */
const current = ref<RedemptionBatch | null>(props.batch);
const tab = ref<'codes' | 'info'>('codes');
const events = ref<BatchEvent[]>([]);
const eventsLoading = ref(false);
const codesPanel = ref<InstanceType<typeof RedemptionCodesPanel> | null>(null);

const codeDrawerVisible = ref(false);
const activeCode = ref<RedemptionCode | null>(null);

async function loadEvents(): Promise<void> {
  if (!current.value) return;
  eventsLoading.value = true;
  try {
    const r = await port.getBatchEvents(current.value.id);
    events.value = r.success ? r.data : [];
  } finally {
    eventsLoading.value = false;
  }
}

watch(visible, (open) => {
  if (!open) return;
  tab.value = 'codes';
  void loadEvents();
});

// 编辑抽屉保存后父组件会换一份新的批次进来：计数、名称、卡密列表都要跟着刷新。
watch(
  () => props.batch,
  (b) => {
    if (!b) return;
    current.value = b;
    void loadEvents();
    void codesPanel.value?.reload();
  },
  { immediate: true },
);

/** 卡密状态变了，批次的计数也跟着变：从列表接口重取这一个批次。 */
async function refreshBatch(): Promise<void> {
  if (!current.value) return;
  const r = await port.listBatches({ page: 1, pageSize: 1, filter: { batchId: current.value.id } });
  const fresh = r.success ? r.data.items.find((b) => b.id === current.value?.id) : undefined;
  if (fresh) {
    current.value = fresh;
    emit('changed', fresh);
  }
}

function applyBatch(b: RedemptionBatch): void {
  current.value = b;
  emit('changed', b);
  void loadEvents();
  void codesPanel.value?.reload();
}

async function exportIt(b: RedemptionBatch): Promise<void> {
  const r = await actions.exportBatch(b);
  if (!r) return;
  applyBatch(r.batch);
  emit('plain', r, 'exported');
}

async function freezeIt(b: RedemptionBatch): Promise<void> {
  const r = await actions.toggleBatchFrozen(b);
  if (r) applyBatch(r);
}

async function voidIt(b: RedemptionBatch): Promise<void> {
  const r = await actions.voidBatch(b);
  if (r) applyBatch(r);
}

function openCode(c: RedemptionCode): void {
  activeCode.value = c;
  codeDrawerVisible.value = true;
}

function onCodeChanged(): void {
  void codesPanel.value?.reload();
  void refreshBatch();
}

function gotoAttempts(b: RedemptionBatch): void {
  visible.value = false;
  void router.push({ name: 'billing-redemption-attempts', query: { batchId: b.id } });
}

const money = (v: number) => formatMoney(v, { currency: 'CNY' });

const stats = computed(() => {
  const b = current.value;
  if (!b) return [];
  return [
    { key: 'redeemed', label: '已兑换', count: b.redeemedCount, tone: 'success' },
    { key: 'unused', label: '未兑换', count: batchUnusedCount(b), tone: 'warning' },
    { key: 'frozen', label: '已冻结', count: b.frozenCount, tone: 'danger' },
    { key: 'voided', label: '已作废', count: b.voidedCount, tone: 'info' },
  ].map((s) => ({ ...s, value: s.count * b.faceValue, pct: b.quantity ? (s.count / b.quantity) * 100 : 0 }));
});

const eventTone: Record<BatchEventAction, 'primary' | 'success' | 'warning' | 'danger' | 'info'> = {
  created: 'primary',
  edited: 'warning',
  appended: 'primary',
  exported: 'success',
  frozen: 'danger',
  unfrozen: 'warning',
  voided: 'info',
  code_frozen: 'danger',
  code_unfrozen: 'warning',
  code_voided: 'info',
};

function validity(b: RedemptionBatch): string {
  const start = b.startsAtUtc ? formatDateTime(b.startsAtUtc) : '生成即生效';
  const end = b.expiresAtUtc ? formatDateTime(b.expiresAtUtc) : '长期有效';
  return `${start} → ${end}`;
}
</script>

<template>
  <el-dialog
    v-model="visible"
    width="80%"
    top="6vh"
    append-to-body
    destroy-on-close
    class="rd-batch-dialog"
  >
    <template #header>
      <div
        v-if="current"
        class="head"
      >
        <span class="head__name">{{ current.name }}</span>
        <StatusTag
          :label="batchDisplayStatus(current).label"
          :tone="batchDisplayStatus(current).tone"
        />
        <code class="head__id">{{ current.id }}</code>
        <span class="head__meta">{{ [current.salesChannel, `面值 ${money(current.faceValue)}`, `${current.quantity} 张`].filter(Boolean).join(' · ') }}</span>
      </div>
    </template>

    <template v-if="current">
      <div class="summary">
        <div
          v-for="s in stats"
          :key="s.key"
          class="stat"
        >
          <span :class="`dot dot--${s.tone}`" />
          <div class="stat__body">
            <span class="stat__label">{{ s.label }}</span>
            <span class="stat__count">{{ s.count }}<small> 张</small></span>
            <span class="stat__value">{{ money(s.value) }}</span>
          </div>
        </div>
        <div class="summary__bar">
          <div class="bar">
            <div
              v-for="s in stats"
              :key="s.key"
              :class="`bar__seg dot--${s.tone}`"
              :style="{ width: `${s.pct}%` }"
            />
          </div>
          <span class="summary__rate">核销率 {{ current.quantity ? ((current.redeemedCount / current.quantity) * 100).toFixed(1) : 0 }}%</span>
        </div>
      </div>

      <el-tabs
        v-model="tab"
        class="tabs"
      >
        <el-tab-pane
          label="卡密使用情况"
          name="codes"
        >
          <div class="codes">
            <RedemptionCodesPanel
              ref="codesPanel"
              :fixed-batch-id="current.id"
              @open="openCode"
              @changed="refreshBatch"
            />
          </div>
        </el-tab-pane>
        <el-tab-pane
          label="批次信息与操作记录"
          name="info"
        >
          <div class="info">
            <el-descriptions
              :column="3"
              size="small"
              border
            >
              <el-descriptions-item label="面值">
                {{ money(current.faceValue) }}
              </el-descriptions-item>
              <el-descriptions-item label="数量">
                {{ current.quantity }} 张 · 共 {{ money(current.quantity * current.faceValue) }}
              </el-descriptions-item>
              <el-descriptions-item label="卡密格式">
                <code>{{ current.codePattern }}</code>
              </el-descriptions-item>
              <el-descriptions-item label="入账途径">
                {{ RedemptionPurposeLabel[current.purpose] }}
              </el-descriptions-item>
              <el-descriptions-item
                label="销售渠道"
                :span="2"
              >
                {{ current.salesChannel ?? '—' }}
              </el-descriptions-item>
              <el-descriptions-item label="每户限兑">
                {{ current.perAccountLimit ? `${current.perAccountLimit} 张` : '不限' }}
              </el-descriptions-item>
              <el-descriptions-item
                label="有效期"
                :span="2"
              >
                {{ validity(current) }}
              </el-descriptions-item>
              <el-descriptions-item label="导出">
                {{ current.exportCount ? `${current.exportCount} 次 · 最近 ${formatDateTime(current.lastExportedAtUtc)}` : '未导出' }}
              </el-descriptions-item>
              <el-descriptions-item
                label="创建"
                :span="3"
              >
                {{ current.createdBy.displayName }} · {{ formatDateTime(current.createdAtUtc) }}
              </el-descriptions-item>
            </el-descriptions>

            <h4 class="section">
              操作记录
            </h4>
            <div v-loading="eventsLoading">
              <el-timeline v-if="events.length">
                <el-timeline-item
                  v-for="ev in events"
                  :key="ev.id"
                  :timestamp="formatDateTime(ev.atUtc)"
                  :type="eventTone[ev.action]"
                  placement="top"
                >
                  <div class="event">
                    <strong>{{ BatchEventActionLabel[ev.action] }}</strong>
                    <span class="event__by">{{ ev.operator.displayName }}</span>
                  </div>
                  <div
                    v-if="ev.detail"
                    class="event__detail"
                  >
                    {{ ev.detail }}
                  </div>
                </el-timeline-item>
              </el-timeline>
              <div
                v-else-if="!eventsLoading"
                class="empty"
              >
                暂无记录
              </div>
            </div>
          </div>
        </el-tab-pane>
      </el-tabs>
    </template>

    <template #footer>
      <div
        v-if="current"
        class="foot"
      >
        <el-button
          link
          type="primary"
          @click="gotoAttempts(current)"
        >
          兑换日志<el-icon class="el-icon--right">
            <TopRight />
          </el-icon>
        </el-button>
        <div class="foot__spacer" />
        <el-button
          :icon="current.status === 'frozen' ? Unlock : Lock"
          :disabled="current.status !== 'active' && current.status !== 'frozen'"
          @click="freezeIt(current)"
        >
          {{ current.status === 'frozen' ? '解冻' : '冻结' }}
        </el-button>
        <el-button
          type="danger"
          plain
          :icon="Delete"
          :disabled="current.status === 'voided' || batchUnusedCount(current) + current.frozenCount === 0"
          @click="voidIt(current)"
        >
          作废
        </el-button>
        <el-button
          :icon="EditPen"
          @click="emit('edit', current)"
        >
          编辑
        </el-button>
        <el-button
          type="primary"
          :icon="Download"
          :disabled="!canExportBatch(current)"
          @click="exportIt(current)"
        >
          导出
        </el-button>
      </div>
    </template>
  </el-dialog>

  <RedemptionCodeDrawer
    v-model:visible="codeDrawerVisible"
    :code="activeCode"
    @changed="onCodeChanged"
  />
</template>

<style scoped>
.head {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
}
.head__name {
  font-size: 16px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}
.head__id,
code {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.head__meta {
  font-size: 12.5px;
  color: var(--el-text-color-secondary);
}

.summary {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr)) minmax(220px, 1.4fr);
  gap: 10px;
  align-items: stretch;
}
.stat {
  display: flex;
  gap: 8px;
  padding: 10px 12px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
}
.stat__body {
  display: flex;
  flex-direction: column;
  line-height: 1.35;
}
.stat__label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.stat__count {
  font-size: 18px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--el-text-color-primary);
}
.stat__count small {
  font-size: 12px;
  font-weight: 400;
  color: var(--el-text-color-secondary);
}
.stat__value {
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: var(--el-text-color-secondary);
}
.dot {
  width: 8px;
  height: 8px;
  margin-top: 5px;
  border-radius: 50%;
  flex-shrink: 0;
}
.dot--success {
  background: var(--el-color-success);
}
.dot--warning {
  background: var(--el-color-warning-light-5);
}
.dot--danger {
  background: var(--el-color-danger);
}
.dot--info {
  background: var(--el-color-info-light-5);
}
.summary__bar {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 8px;
  padding: 10px 12px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
}
.bar {
  display: flex;
  height: 10px;
  border-radius: 5px;
  overflow: hidden;
  background: var(--el-fill-color);
}
.summary__rate {
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.tabs {
  margin-top: 8px;
}
.codes {
  height: 52vh;
  min-height: 360px;
}
.info {
  height: 52vh;
  min-height: 360px;
  overflow-y: auto;
  padding-right: 4px;
}
.section {
  margin: 18px 0 10px;
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}
.event {
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-size: 13px;
}
.event__by {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.event__detail {
  margin-top: 2px;
  font-size: 12px;
  color: var(--el-text-color-regular);
}
.empty {
  padding: 16px 0;
  font-size: 12px;
  color: var(--el-text-color-placeholder);
}
.foot {
  display: flex;
  align-items: center;
  gap: 8px;
}
.foot :deep(.el-button + .el-button) {
  margin-left: 0;
}
.foot__spacer {
  flex: 1;
}
</style>

<style>
/* el-dialog 被 Teleport 到 body，scoped 命不中；收紧 body 上下留白，把高度留给表格。 */
.rd-batch-dialog .el-dialog__body {
  padding-top: 4px;
  padding-bottom: 0;
}
</style>
