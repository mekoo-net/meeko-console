<script setup lang="ts">
/**
 * 一个账号的积分：余额、全部流水（含每次调用的冻结 / 扣除 / 退回），和员工发放 / 调减。
 */
import { computed, ref, watch } from 'vue';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';

import { formatDateTime } from '@/shared/lib/date';

import type { PointBalance, PointTxn } from '../model/jastalk.types';
import { formatPoints, sourceKindLabels, txnAmountText, txnDirection, txnKindLabels } from '../model/jastalkFormat';
import { getJastalkAdminPort } from '../services';

const props = defineProps<{ accountUid: number | null }>();
const emit = defineEmits<{
  (e: 'close'): void;
  /** 余额变了，列表里的数要跟着刷。 */
  (e: 'changed'): void;
}>();

const port = getJastalkAdminPort();

const open = computed({
  get: () => props.accountUid !== null,
  set: (v) => {
    if (!v) emit('close');
  },
});

const balance = ref<PointBalance>({ available: 0, held: 0 });
const txns = ref<PointTxn[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(20);
const loading = ref(false);
let seq = 0;

async function load(): Promise<void> {
  const uid = props.accountUid;
  if (uid === null) return;
  const mine = ++seq;
  loading.value = true;
  try {
    const r = await port.pointAccount(uid, { p: page.value, pageSize: pageSize.value });
    if (mine !== seq) return;
    if (!r.success) {
      ElMessage.error(r.error.message);
      return;
    }
    balance.value = r.data.balance;
    txns.value = r.data.txns.items;
    total.value = r.data.txns.total;
  } finally {
    if (mine === seq) loading.value = false;
  }
}

watch(
  () => props.accountUid,
  (uid) => {
    if (uid === null) return;
    txns.value = [];
    total.value = 0;
    if (page.value === 1) void load();
    else page.value = 1;
  },
);
watch([page, pageSize], () => void load());

// ─── 调整 ────────────────────────────────────────────────

interface AdjustForm {
  direction: 'grant' | 'deduct';
  amount: number;
  note: string;
}

const dialogOpen = ref(false);
const saving = ref(false);
const formRef = ref<FormInstance>();
const form = ref<AdjustForm>({ direction: 'grant', amount: 100, note: '' });
/** 这一次打开弹窗的请求号：点了保存没等到回包又点一次，后端只记一笔。 */
let requestId = '';

const rules: FormRules<AdjustForm> = {
  note: [{ required: true, message: '写一下为什么调', trigger: 'blur' }],
};

function adjust(): void {
  form.value = { direction: 'grant', amount: 100, note: '' };
  requestId = crypto.randomUUID();
  dialogOpen.value = true;
}

async function save(): Promise<void> {
  const uid = props.accountUid;
  if (uid === null || !(await formRef.value?.validate().catch(() => false))) return;
  saving.value = true;
  try {
    const delta = form.value.direction === 'grant' ? form.value.amount : -form.value.amount;
    const r = await port.adjustPoints(uid, { delta, note: form.value.note.trim(), requestId });
    if (!r.success) {
      ElMessage.error(r.error.message);
      return;
    }
    ElMessage.success(form.value.direction === 'grant' ? '已发放' : '已调减');
    dialogOpen.value = false;
    balance.value = r.data;
    emit('changed');
    if (page.value === 1) await load();
    else page.value = 1;
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <el-drawer
    v-model="open"
    :title="`积分 · 账户 ${accountUid ?? ''}`"
    size="760px"
    destroy-on-close
  >
    <div class="summary">
      <div class="summary__item">
        <span class="summary__label">可用</span>
        <span class="summary__value num">{{ formatPoints(balance.available) }}</span>
      </div>
      <div class="summary__item">
        <span class="summary__label">冻结</span>
        <span
          class="summary__value summary__value--muted num"
          title="进行中的调用冻着的；回完按实际用量扣，多冻的退回"
        >{{ formatPoints(balance.held) }}</span>
      </div>
      <el-button
        type="primary"
        class="summary__action"
        @click="adjust"
      >
        发放 / 调减
      </el-button>
    </div>

    <el-table
      v-loading="loading"
      :data="txns"
      row-key="id"
      size="small"
      class="compact-table"
      :empty-text="loading ? ' ' : '还没有积分变动'"
    >
      <el-table-column
        label="时间"
        width="150"
      >
        <template #default="{ row }: { row: PointTxn }">
          <span class="cell-date">{{ formatDateTime(row.createdAt, 'YYYY-MM-DD HH:mm:ss') }}</span>
        </template>
      </el-table-column>
      <el-table-column
        label="类型"
        width="76"
      >
        <template #default="{ row }: { row: PointTxn }">
          {{ txnKindLabels[row.kind] }}
        </template>
      </el-table-column>
      <el-table-column
        label="积分"
        width="110"
        align="right"
      >
        <template #default="{ row }: { row: PointTxn }">
          <span
            class="num"
            :class="`amount--${txnDirection(row.kind)}`"
          >{{ txnAmountText(row) }}</span>
        </template>
      </el-table-column>
      <el-table-column
        label="可用"
        width="110"
        align="right"
      >
        <template #default="{ row }: { row: PointTxn }">
          <span class="num">{{ formatPoints(row.availableAfter) }}</span>
        </template>
      </el-table-column>
      <el-table-column
        label="来由"
        min-width="200"
      >
        <template #default="{ row }: { row: PointTxn }">
          <div class="cell-stack">
            <span v-if="row.note">{{ row.note }}</span>
            <span
              class="cell-sub mono"
              :title="row.source.ref"
            >{{ sourceKindLabels[row.source.kind] }} {{ row.source.ref }}</span>
          </div>
        </template>
      </el-table-column>
    </el-table>

    <el-pagination
      v-model:current-page="page"
      v-model:page-size="pageSize"
      class="pager"
      :total="total"
      :page-sizes="[20, 50, 100]"
      layout="total, sizes, prev, pager, next"
      background
      small
    />
  </el-drawer>

  <el-dialog
    v-model="dialogOpen"
    title="发放 / 调减积分"
    width="440px"
    align-center
    :close-on-click-modal="false"
  >
    <el-form
      ref="formRef"
      :model="form"
      :rules="rules"
      label-width="72px"
    >
      <el-form-item label="方向">
        <el-radio-group v-model="form.direction">
          <el-radio-button value="grant">
            发放
          </el-radio-button>
          <el-radio-button value="deduct">
            调减
          </el-radio-button>
        </el-radio-group>
      </el-form-item>
      <el-form-item label="积分">
        <el-input-number
          v-model="form.amount"
          :min="0.01"
          :precision="2"
          :step="100"
          controls-position="right"
        />
        <span
          v-if="form.direction === 'deduct'"
          class="hint"
        >最多扣到 0（现在可用 {{ formatPoints(balance.available) }}）</span>
      </el-form-item>
      <el-form-item
        label="原因"
        prop="note"
      >
        <el-input
          v-model="form.note"
          type="textarea"
          :rows="2"
          maxlength="200"
          show-word-limit
          placeholder="会记在这一笔流水上"
        />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="dialogOpen = false">
        取消
      </el-button>
      <el-button
        type="primary"
        :loading="saving"
        @click="save"
      >
        确定
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.summary {
  display: flex;
  align-items: flex-end;
  gap: 32px;
  margin-bottom: 16px;
}

.summary__item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.summary__label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.summary__value {
  font-size: 22px;
  font-weight: 600;
  line-height: 1.2;
}

.summary__value--muted {
  color: var(--el-text-color-secondary);
}

.summary__action {
  margin-left: auto;
}

.pager {
  margin-top: 12px;
  justify-content: flex-end;
}

.mono {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
}

.num {
  font-variant-numeric: tabular-nums;
}

.cell-stack {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  line-height: 1.35;
}

.cell-stack .mono {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.amount--in {
  color: var(--el-color-success);
}

.amount--out,
.amount--settle {
  color: var(--el-text-color-regular);
}

.hint {
  margin-left: 10px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>
