<script setup lang="ts">
/**
 * 调用日志驳回对话框（admin 专用）。
 *
 * 业务定义详见 `docs/api/05-billing-bills.md` ——
 * 驳回 = 账单 `status='reversed'`、`actualAmount=0`，**不另起一条流水**，钱包余额走反向冲账。
 *
 * 表单约束：
 *  - `reasonCode` 必填（5 选 1 枚举，不允许自由文本作为主因）
 *  - `remark` 可选，长度上限 200，写入审计日志方便后续复盘
 *  - 提交按钮 type=danger，要求用户对"金钱操作"保持警觉
 *
 * 与 `confirmDanger` 的区别：那个只 yes/no，这里要选原因码 + 写备注，
 * 所以不复用 `useConfirm`，而是显式做一个轻量 ElDialog。
 */
import { computed, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import type { FormInstance, FormRules } from 'element-plus';

import { BILLING_FRACTION_DIGITS, formatMoney } from '@/shared/lib/money';
import { formatDateTime } from '@/shared/lib/date';

import {
  billReverseCodeValues,
  BillReverseCodeHint,
  BillReverseCodeLabel,
  type BillReverseCode,
} from '../model/enums';
import type { LogEntry, ReverseLogInput } from '../model/log.types';

interface Props {
  modelValue: boolean;
  /** 当前要驳回的日志；为 null 时弹窗不应该被触发 */
  log: LogEntry | null;
  /** 上游正在提交中（来自父组件持有的 loading flag） */
  submitting: boolean;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void;
  (e: 'submit', payload: ReverseLogInput): void;
}>();

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
});

interface FormState {
  reasonCode: BillReverseCode | '';
  remark: string;
}

const formRef = ref<FormInstance | null>(null);
const form = ref<FormState>({ reasonCode: '', remark: '' });

/**
 * 选中原因码后的"何时该用"提示。
 *
 * el-select 收起来后用户只看到标签（如"客户补偿"），但 admin 可能记不准每个码的
 * 业务边界；把 hint 显式贴在表单项底下，比让用户重新展开下拉更省事。
 */
const selectedReasonHint = computed(() => {
  if (form.value.reasonCode === '') return '';
  return BillReverseCodeHint[form.value.reasonCode];
});

// 每次重新打开都重置表单，避免上次的选择残留
watch(
  () => props.modelValue,
  (v) => {
    if (v) {
      form.value = { reasonCode: '', remark: '' };
      formRef.value?.clearValidate();
    }
  },
);

const rules: FormRules<FormState> = {
  reasonCode: [{ required: true, message: '请选择驳回原因', trigger: 'change' }],
  remark: [{ max: 200, message: '备注长度上限 200 字符', trigger: 'blur' }],
};

async function onConfirm(): Promise<void> {
  const log = props.log;
  if (!log) return;
  const valid = await formRef.value?.validate().catch(() => false);
  if (!valid) return;
  if (form.value.reasonCode === '') {
    ElMessage.warning('请选择驳回原因');
    return;
  }
  emit('submit', {
    logId: log.id,
    reasonCode: form.value.reasonCode,
    remark: form.value.remark.trim() || undefined,
  });
}

function onCancel(): void {
  if (props.submitting) return;
  visible.value = false;
}
</script>

<template>
  <el-dialog
    v-model="visible"
    title="驳回扣费"
    width="520px"
    :close-on-click-modal="false"
    :close-on-press-escape="!submitting"
    :show-close="!submitting"
    align-center
  >
    <div v-if="log" class="reverse-dialog">
      <el-alert
        type="warning"
        :closable="false"
        show-icon
        title="此操作会让本次调用的扣费金额变为 0，钱包余额反向冲账。"
        description="驳回不可撤销；如需重新计费请在 BFF 端按账单 UID 走「重新入账」流程。"
      />

      <div class="reverse-dialog__meta">
        <div class="meta-row">
          <span class="meta-label">日志 UID</span>
          <span class="mono">{{ log.id }}</span>
        </div>
        <div class="meta-row">
          <span class="meta-label">账单 UID</span>
          <span class="mono">{{ log.bill?.id ?? '—' }}</span>
        </div>
        <div class="meta-row">
          <span class="meta-label">调用时间</span>
          <span>{{ formatDateTime(log.createAt, 'YYYY-MM-DD HH:mm:ss') }}</span>
        </div>
        <div class="meta-row">
          <span class="meta-label">原扣费金额</span>
          <span class="cost-amount">{{ formatMoney(log.cost.total, { fractionDigits: BILLING_FRACTION_DIGITS }) }}</span>
        </div>
      </div>

      <el-form
        ref="formRef"
        :model="form"
        :rules="rules"
        label-position="top"
        size="default"
        class="reverse-dialog__form"
      >
        <el-form-item label="驳回原因" prop="reasonCode" required>
          <el-select
            v-model="form.reasonCode"
            placeholder="请选择驳回原因"
            class="reason-select"
            popper-class="reason-select__popper"
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
          <div v-if="selectedReasonHint" class="reason-select__hint">
            {{ selectedReasonHint }}
          </div>
        </el-form-item>

        <el-form-item label="备注（可选）" prop="remark">
          <el-input
            v-model="form.remark"
            type="textarea"
            :rows="2"
            maxlength="200"
            show-word-limit
            placeholder="补充上下文 / 工单号 / 客户对接人等，便于事后审计追溯"
          />
        </el-form-item>
      </el-form>
    </div>

    <template #footer>
      <span class="dialog-footer">
        <el-button :disabled="submitting" @click="onCancel">取消</el-button>
        <el-button type="danger" :loading="submitting" @click="onConfirm">
          确认驳回
        </el-button>
      </span>
    </template>
  </el-dialog>
</template>

<style scoped>
.reverse-dialog {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.reverse-dialog__meta {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 12px;
  background: var(--el-fill-color-light);
  border-radius: 6px;
  font-size: 12.5px;
}
.meta-row {
  display: flex;
  align-items: center;
  gap: 10px;
}
.meta-label {
  width: 80px;
  color: var(--el-text-color-secondary);
  flex-shrink: 0;
}
.mono {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-variant-numeric: tabular-nums;
}
.cost-amount {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-variant-numeric: tabular-nums;
  color: var(--el-color-warning);
  font-weight: 600;
}

.reverse-dialog__form {
  margin-top: 4px;
}
.reason-select {
  width: 100%;
}
.reason-select__hint {
  margin-top: 4px;
  font-size: 11.5px;
  line-height: 1.4;
  color: var(--el-text-color-secondary);
}

.dialog-footer {
  display: inline-flex;
  gap: 8px;
}
</style>

<style>
/* el-select 下拉浮层挂在 body，不受 scoped 限制 —— 需要全局规则覆盖单项的 padding / 行高 */
.reason-select__popper .el-select-dropdown__item {
  height: auto;
  padding: 8px 12px;
  line-height: 1.4;
}
.reason-option {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.reason-option__title {
  font-size: 13px;
  color: var(--el-text-color-primary);
  font-weight: 500;
}
.reason-option__hint {
  font-size: 11.5px;
  color: var(--el-text-color-secondary);
}
</style>
