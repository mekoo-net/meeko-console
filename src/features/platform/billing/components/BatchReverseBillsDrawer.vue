<script setup lang="ts">
/**
 * 批量驳回账单抽屉。
 *
 * 场景：客诉 / 故障复盘后拿到一串账单号（工单、对账单里直接复制），需要一次性把
 * 这些扣费驳掉。语义与调用日志页的单条「驳回扣费」完全一致 ——
 * 账单 `status='reversed'`、`actualAmount=0`、钱包余额反向冲账，不另起流水。
 *
 * 交互取舍：
 *  - 原因码整批共用：一次批量就是一个事由（某次故障 / 某个客户补偿），
 *    逐行选原因码既繁琐又容易选错，真要分事由就分两批跑
 *  - 不做「全成功才算数」的事务：每条账单是独立事务，部分失败是常态
 *    （重复驳回、账单已冲销），所以逐行回显结果，失败的可以复制出来重试
 */
import { computed, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';

import { confirmDanger } from '@/shared/composables/useConfirm';

import {
  billReverseCodeValues,
  BillReverseCodeHint,
  BillReverseCodeLabel,
  type BillReverseCode,
} from '@demux/common';

import {
  useBatchReverseBills,
  type BatchReverseRow,
  type BatchReverseStatus,
} from '../composables/useBatchReverseBills';

interface Props {
  modelValue: boolean;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void;
  /** 有账单被成功驳回，父页面据此刷新列表。 */
  (e: 'done'): void;
}>();

const batch = useBatchReverseBills();
const { rows, duplicateCount, running, executed, summary, progress } = batch;

const serialText = ref('');
const reasonCode = ref<BillReverseCode | ''>('');
const remark = ref('');

const reasonHint = computed(() =>
  reasonCode.value === '' ? '' : BillReverseCodeHint[reasonCode.value],
);

const canSubmit = computed(() => summary.value.pending > 0 && reasonCode.value !== '');

watch(
  () => serialText.value,
  (text) => {
    // 跑批途中不再重解析，否则会把正在执行的行状态冲掉
    if (running.value) return;
    batch.parse(text);
  },
);

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return;
    serialText.value = '';
    reasonCode.value = '';
    remark.value = '';
    batch.reset();
  },
);

function close(): void {
  if (running.value) {
    ElMessage.warning('批量驳回进行中，请先停止或等待完成');
    return;
  }
  emit('update:modelValue', false);
}

async function submit(): Promise<void> {
  if (reasonCode.value === '') {
    ElMessage.warning('请选择驳回原因');
    return;
  }
  const pending = summary.value.pending;
  const confirmed = await confirmDanger({
    title: '确认批量驳回',
    message:
      `将驳回 ${pending} 条账单（原因：${BillReverseCodeLabel[reasonCode.value]}）。\n` +
      '驳回后扣费金额归零、钱包余额反向冲账，且不可撤销。',
    confirmText: '开始驳回',
    type: 'danger',
  });
  if (!confirmed) return;

  await batch.run({
    reasonCode: reasonCode.value,
    ...(remark.value.trim() ? { remark: remark.value.trim() } : {}),
  });

  const s = summary.value;
  if (s.success > 0) {
    emit('done');
    ElMessage.success(`批量驳回完成：成功 ${s.success} 条，失败 ${s.failed + s.notFound} 条`);
  } else {
    ElMessage.warning('本次没有账单被驳回，请查看下方结果说明');
  }
}

async function copyRetryable(): Promise<void> {
  const text = batch.retryableText();
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    ElMessage.success('已复制失败账单号');
  } catch {
    ElMessage.error('复制失败，请手动选中结果列表');
  }
}

const StatusLabel: Readonly<Record<BatchReverseStatus, string>> = {
  pending: '待驳回',
  running: '处理中',
  success: '已驳回',
  failed: '失败',
  not_found: '未找到',
  invalid: '格式错误',
};

const StatusTone: Readonly<Record<BatchReverseStatus, 'info' | 'success' | 'warning' | 'danger'>> = {
  pending: 'info',
  running: 'warning',
  success: 'success',
  failed: 'danger',
  not_found: 'warning',
  invalid: 'danger',
};
</script>

<template>
  <el-drawer
    :model-value="modelValue"
    title="批量驳回账单"
    direction="rtl"
    size="720px"
    :close-on-click-modal="false"
    :close-on-press-escape="!running"
    :show-close="!running"
    @update:model-value="close"
  >
    <div class="batch-reverse">
      <el-alert
        type="warning"
        :closable="false"
        show-icon
        title="驳回会把这些账单的扣费金额归零，钱包余额反向冲账。"
        description="操作不可撤销；每条账单独立提交，部分失败不影响其它条。"
      />

      <el-form label-position="top" size="default" class="batch-reverse__form">
        <el-form-item label="账单号（每行一个）" required>
          <el-input
            v-model="serialText"
            type="textarea"
            :rows="8"
            :disabled="running"
            resize="vertical"
            placeholder="BL20260708000000678&#10;BL20260708000000679"
          />
          <div class="batch-reverse__parse">
            <span>共 {{ summary.total }} 条</span>
            <span v-if="summary.pending > 0" class="tone-info">待驳回 {{ summary.pending }}</span>
            <span v-if="duplicateCount > 0" class="tone-muted">去重 {{ duplicateCount }}</span>
            <span v-if="summary.invalid > 0" class="tone-danger">格式错误 {{ summary.invalid }}</span>
          </div>
        </el-form-item>

        <el-form-item label="驳回原因（整批共用）" required>
          <el-select
            v-model="reasonCode"
            :disabled="running"
            placeholder="请选择驳回原因"
            class="batch-reverse__select"
            popper-class="batch-reverse__popper"
          >
            <el-option
              v-for="code in billReverseCodeValues"
              :key="code"
              :value="code"
              :label="BillReverseCodeLabel[code]"
            >
              <div class="reason-option">
                <span class="reason-option__title">{{ BillReverseCodeLabel[code] }}</span>
                <span class="reason-option__hint">{{ BillReverseCodeHint[code] }}</span>
              </div>
            </el-option>
          </el-select>
          <div v-if="reasonHint" class="batch-reverse__hint">{{ reasonHint }}</div>
        </el-form-item>

        <el-form-item label="备注（可选）">
          <el-input
            v-model="remark"
            type="textarea"
            :rows="2"
            maxlength="200"
            show-word-limit
            :disabled="running"
            placeholder="工单号 / 故障编号 / 客户对接人等，写入审计日志便于事后追溯"
          />
        </el-form-item>
      </el-form>

      <template v-if="executed">
        <el-divider content-position="left">执行结果</el-divider>

        <div class="batch-reverse__progress">
          <el-progress
            :percentage="progress"
            :status="running ? undefined : 'success'"
            :stroke-width="10"
            class="batch-reverse__bar"
          />
          <span class="batch-reverse__counter">
            {{ summary.total - summary.pending }} / {{ summary.total }}
          </span>
        </div>

        <div class="batch-reverse__summary">
          <el-tag type="success" size="small" effect="plain">成功 {{ summary.success }}</el-tag>
          <el-tag type="danger" size="small" effect="plain">失败 {{ summary.failed }}</el-tag>
          <el-tag type="warning" size="small" effect="plain">未找到 {{ summary.notFound }}</el-tag>
          <el-tag type="info" size="small" effect="plain">未处理 {{ summary.pending }}</el-tag>
        </div>

        <el-table :data="rows" size="small" max-height="280" class="batch-reverse__table">
          <el-table-column label="账单号" min-width="190">
            <template #default="{ row }: { row: BatchReverseRow }">
              <span class="mono">{{ row.billSerialNo }}</span>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="96">
            <template #default="{ row }: { row: BatchReverseRow }">
              <el-tag :type="StatusTone[row.status]" size="small" effect="plain">
                {{ StatusLabel[row.status] }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="说明" min-width="200">
            <template #default="{ row }: { row: BatchReverseRow }">
              <span v-if="row.message" class="batch-reverse__msg">{{ row.message }}</span>
              <span v-else class="tone-muted">—</span>
            </template>
          </el-table-column>
        </el-table>
      </template>
    </div>

    <template #footer>
      <div class="batch-reverse__footer">
        <el-button
          v-if="executed && summary.failed + summary.notFound > 0"
          :disabled="running"
          @click="copyRetryable"
        >
          复制失败账单号
        </el-button>
        <el-button v-if="running" type="warning" @click="batch.cancel()">停止</el-button>
        <el-button v-else @click="close">关闭</el-button>
        <el-button
          type="danger"
          :disabled="!canSubmit"
          :loading="running"
          @click="submit"
        >
          批量驳回{{ summary.pending > 0 ? `（${summary.pending}）` : '' }}
        </el-button>
      </div>
    </template>
  </el-drawer>
</template>

<style scoped>
.batch-reverse {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.batch-reverse__form {
  margin-top: 4px;
}

.batch-reverse__select {
  width: 100%;
}

.batch-reverse__parse {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 6px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.batch-reverse__hint {
  margin-top: 4px;
  font-size: 11.5px;
  line-height: 1.4;
  color: var(--el-text-color-secondary);
}

.batch-reverse__progress {
  display: flex;
  align-items: center;
  gap: 12px;
}

.batch-reverse__bar {
  flex: 1;
  min-width: 0;
}

.batch-reverse__counter {
  flex-shrink: 0;
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-variant-numeric: tabular-nums;
  font-size: 12.5px;
  color: var(--el-text-color-secondary);
}

.batch-reverse__summary {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.batch-reverse__table {
  width: 100%;
}

.batch-reverse__msg {
  font-size: 12.5px;
  color: var(--el-text-color-regular);
}

.batch-reverse__footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.mono {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-variant-numeric: tabular-nums;
  font-size: 12.5px;
}

.tone-info {
  color: var(--el-color-primary);
}
.tone-danger {
  color: var(--el-color-danger);
}
.tone-muted {
  color: var(--el-text-color-placeholder);
}
</style>

<style>
/* el-select 浮层挂在 body，scoped 管不到；与单条驳回对话框保持同一套下拉样式 */
.batch-reverse__popper .el-select-dropdown__item {
  height: auto;
  padding: 8px 12px;
  line-height: 1.4;
}
.batch-reverse__popper .reason-option {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.batch-reverse__popper .reason-option__title {
  font-size: 13px;
  color: var(--el-text-color-primary);
  font-weight: 500;
}
.batch-reverse__popper .reason-option__hint {
  font-size: 11.5px;
  color: var(--el-text-color-secondary);
}
</style>
