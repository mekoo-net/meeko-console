<script setup lang="ts">
/**
 * 驳回扣费：Billing 把回合的扣费全额退回钱包，回合标成已驳回，不可撤销。
 * 驳的是回合不是行——一回合多次调用（工具轮次）挂同一笔钱，所以按回合去重，从抽屉来一个、从勾选来一批。
 * 一批共用一个原因：一次批量就是一个事由。原因码与 Yomi 调用日志的驳回同一套。
 * 服务端逐个处理、逐个回结果：成了的交给父组件贴到行上，没成的留在框里列出来。
 */
import { computed, ref, watch } from 'vue';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';

import {
  billReverseCodeValues,
  BillReverseCodeHint,
  BillReverseCodeLabel,
  type BillReverseCode,
} from '@yomi/common';

import type { LogRow, TurnReversalRejected, TurnReversed } from '../../model/metering.types';
import { formatCny } from '../../model/meteringFormat';
import { roundTo } from '../../model/pricingPreview';
import { getTavernBillingPort } from '../../services';

const visible = defineModel<boolean>('visible', { required: true });
const props = defineProps<{ rows: readonly LogRow[] }>();
const emit = defineEmits<{ reversed: [done: TurnReversed[]] }>();

interface FormState {
  reasonCode: BillReverseCode | '';
  remark: string;
}

interface Turn {
  id: number;
  accountUid: number;
  amount: number;
  billSerialNo: string | null;
}

const port = getTavernBillingPort();
const formRef = ref<FormInstance>();
const form = ref<FormState>({ reasonCode: '', remark: '' });
const submitting = ref(false);
const rejected = ref<TurnReversalRejected[]>([]);

const rules: FormRules<FormState> = {
  reasonCode: [{ required: true, message: '选一个驳回原因', trigger: 'change' }],
};

const turns = computed<Turn[]>(() => {
  const byId = new Map<number, Turn>();
  for (const { accountUid, bill } of props.rows) {
    if (!bill?.reversible) continue;
    byId.set(bill.usageLogId, { id: bill.usageLogId, accountUid, amount: bill.amount, billSerialNo: bill.billSerialNo });
  }
  return [...byId.values()];
});
const single = computed(() => (turns.value.length === 1 ? turns.value[0]! : null));
const accounts = computed(() => new Set(turns.value.map((t) => t.accountUid)).size);
const totalAmount = computed(() => sumAmount(turns.value));

function sumAmount(list: readonly Turn[]): number {
  return roundTo(list.reduce((s, t) => s + t.amount, 0), 6);
}

watch(visible, (open) => {
  if (!open) return;
  form.value = { reasonCode: '', remark: '' };
  rejected.value = [];
  formRef.value?.clearValidate();
});

async function submit(): Promise<void> {
  const valid = await formRef.value?.validate().catch(() => false);
  const { reasonCode, remark } = form.value;
  if (!valid || !reasonCode) return;

  submitting.value = true;
  try {
    const r = await port.reverse({
      ids: turns.value.map((t) => t.id),
      reasonCode,
      remark: remark.trim() || undefined,
    });
    if (!r.success) {
      ElMessage.error(r.error.message);
      return;
    }

    const done = r.data.filter((o): o is TurnReversed => o.outcome === 'reversed');
    rejected.value = r.data.filter((o): o is TurnReversalRejected => o.outcome === 'rejected');
    if (done.length > 0) {
      const ids = new Set(done.map((o) => o.id));
      ElMessage.success(
        `已驳回 ${done.length} 个回合，退回 ${formatCny(sumAmount(turns.value.filter((t) => ids.has(t.id))))}`,
      );
      emit('reversed', done);
    }
    if (rejected.value.length === 0) visible.value = false;
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <el-dialog
    v-model="visible"
    title="驳回扣费"
    width="480px"
    append-to-body
    align-center
    :close-on-click-modal="false"
    :close-on-press-escape="!submitting"
    :show-close="!submitting"
  >
    <dl
      v-if="!rejected.length"
      class="reverse__meta"
    >
      <template v-if="single">
        <dt>账户</dt>
        <dd class="mono">
          {{ single.accountUid }}
        </dd>
        <dt>账单号</dt>
        <dd class="mono">
          {{ single.billSerialNo }}
        </dd>
      </template>
      <template v-else>
        <dt>回合</dt>
        <dd class="num">
          {{ turns.length }} 个，涉及 {{ accounts }} 个账户
        </dd>
      </template>
      <dt>退回</dt>
      <dd class="reverse__amount num">
        {{ formatCny(totalAmount) }}
      </dd>
    </dl>

    <section
      v-if="rejected.length"
      class="reverse__rejected"
    >
      <h4 class="reverse__rejected-title">
        {{ rejected.length }} 个回合没驳回
      </h4>
      <ul>
        <li
          v-for="o in rejected"
          :key="o.id"
        >
          <span class="mono">#{{ o.id }}</span>
          <span>{{ o.reason }}</span>
        </li>
      </ul>
    </section>

    <el-form
      v-else
      ref="formRef"
      :model="form"
      :rules="rules"
      label-position="top"
    >
      <el-form-item
        label="原因"
        prop="reasonCode"
      >
        <el-select
          v-model="form.reasonCode"
          placeholder="选择驳回原因"
          popper-class="turn-reverse__popper"
          style="width: 100%"
        >
          <el-option
            v-for="code in billReverseCodeValues"
            :key="code"
            :value="code"
            :label="BillReverseCodeLabel[code]"
          >
            <div class="reverse__option">
              <span>{{ BillReverseCodeLabel[code] }}</span>
              <span class="reverse__hint">{{ BillReverseCodeHint[code] }}</span>
            </div>
          </el-option>
        </el-select>
      </el-form-item>

      <el-form-item label="备注">
        <el-input
          v-model="form.remark"
          type="textarea"
          :rows="2"
          maxlength="200"
          show-word-limit
          placeholder="工单号、客户对接人等，可不填"
        />
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button
        v-if="rejected.length"
        @click="visible = false"
      >
        关闭
      </el-button>
      <template v-else>
        <el-button
          :disabled="submitting"
          @click="visible = false"
        >
          取消
        </el-button>
        <el-button
          type="danger"
          :loading="submitting"
          @click="submit"
        >
          {{ single ? '确认驳回' : `确认驳回 ${turns.length} 个` }}
        </el-button>
      </template>
    </template>
  </el-dialog>
</template>

<style scoped>
.reverse__meta {
  display: grid;
  grid-template-columns: 56px 1fr;
  gap: 6px 10px;
  margin: 0 0 16px;
  padding: 10px 12px;
  border-radius: 6px;
  background: var(--el-fill-color-light);
  font-size: 12.5px;
}

.reverse__meta dt {
  color: var(--el-text-color-secondary);
}

.reverse__meta dd {
  margin: 0;
}

.reverse__amount {
  font-weight: 600;
  color: var(--el-color-danger);
}

.reverse__rejected {
  padding: 10px 12px;
  border: 1px solid var(--el-color-warning-light-5);
  border-radius: 6px;
  background: var(--el-color-warning-light-9);
  font-size: 12.5px;
}

.reverse__rejected-title {
  margin: 0 0 6px;
  font-size: 13px;
  font-weight: 600;
  color: var(--el-color-warning-dark-2);
}

.reverse__rejected ul {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 220px;
  margin: 0;
  padding: 0;
  overflow-y: auto;
  list-style: none;
}

.reverse__rejected li {
  display: flex;
  gap: 10px;
}

.mono {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
}

.num {
  font-variant-numeric: tabular-nums;
}
</style>

<style>
/* 下拉挂在 body 上，scoped 够不着；每项两行（名称 + 何时用），要放开固定行高。 */
.turn-reverse__popper .el-select-dropdown__item {
  height: auto;
  padding: 6px 12px;
  line-height: 1.4;
}

.turn-reverse__popper .reverse__option {
  display: flex;
  flex-direction: column;
}

.turn-reverse__popper .reverse__hint {
  font-size: 11.5px;
  color: var(--el-text-color-secondary);
}
</style>
