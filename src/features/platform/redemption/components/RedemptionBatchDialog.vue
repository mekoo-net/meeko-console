<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { Delete, Download, EditPen, Lock, TopRight, Unlock } from '@element-plus/icons-vue';

import StatusTag from '@/shared/ui/StatusTag.vue';
import { formatMoney } from '@/shared/lib/money';

import { useRedemptionActions } from '../composables/useRedemptionActions';
import {
  batchDisplayStatus,
  batchUnusedCount,
  canExportBatch,
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
const codesPanel = ref<InstanceType<typeof RedemptionCodesPanel> | null>(null);

const codeDrawerVisible = ref(false);
const activeCode = ref<RedemptionCode | null>(null);

// 编辑抽屉保存后父组件会换一份新的批次进来：计数、名称、卡密列表都要跟着刷新。
watch(
  () => props.batch,
  (b) => {
    if (!b) return;
    current.value = b;
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

      <div class="codes">
        <RedemptionCodesPanel
          ref="codesPanel"
          :fixed-batch-id="current.id"
          @open="openCode"
          @changed="refreshBatch"
        />
      </div>
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

.codes {
  margin-top: 12px;
  height: 56vh;
  min-height: 360px;
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
