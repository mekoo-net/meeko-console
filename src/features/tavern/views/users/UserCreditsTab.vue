<script setup lang="ts">
/**
 * 用户视角 › 积分：全部流水（含回合的预扣与退回），员工发放 / 调减。余额在头部。
 * 回合流水点得回调用日志看那一回合。
 */
import { inject, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';

import EmptyState from '@/shared/ui/EmptyState.vue';
import FillListPageLayout from '@/shared/ui/FillListPageLayout.vue';
import { formatDateTime } from '@/shared/lib/date';

import { TavernUserKey } from '../../composables/tavernUserContext';
import {
  CREDIT_TXN_IN,
  CreditTxnKindLabel,
  CreditTxnSourceText,
  type CreditAccount,
  type CreditTxn,
} from '../../model/credits.types';
import { formatCredits } from '../../model/meteringFormat';
import { getTavernCreditsPort } from '../../services';

const props = defineProps<{ accountUid: number }>();

const port = getTavernCreditsPort();
const router = useRouter();
const user = inject(TavernUserKey);

const account = ref<CreditAccount | null>(null);
const loading = ref(false);
const page = ref(1);
const pageSize = ref(20);

async function load(): Promise<void> {
  loading.value = true;
  try {
    const r = await port.account(props.accountUid, page.value, pageSize.value);
    if (r.success) account.value = r.data;
    else ElMessage.error(r.error.message);
  } finally {
    loading.value = false;
  }
}

watch([page, pageSize], () => void load());

function signed(t: CreditTxn): string {
  return `${CREDIT_TXN_IN.has(t.kind) ? '+' : '−'}${formatCredits(t.amount)}`;
}

function openTurn(t: CreditTxn): void {
  void router.push({ name: 'tavern-user-logs', params: { uid: String(props.accountUid) }, query: { traceId: t.source.ref } });
}

// ─── 发放 / 调减 ─────────────────────────────────────────

interface AdjustForm {
  direction: 'grant' | 'deduct';
  amount: number;
  note: string;
}

const adjustOpen = ref(false);
const adjusting = ref(false);
const adjustRef = ref<FormInstance>();
const adjustForm = ref<AdjustForm>({ direction: 'grant', amount: 100, note: '' });
/** 打开对话框时生成，重复点「确定」只记一次。 */
let requestId = '';

const adjustRules: FormRules<AdjustForm> = {
  note: [{ required: true, message: '请填写调整原因', trigger: 'blur' }],
};

function openAdjust(): void {
  adjustForm.value = { direction: 'grant', amount: 100, note: '' };
  requestId = crypto.randomUUID();
  adjustOpen.value = true;
}

async function submitAdjust(): Promise<void> {
  if (!(await adjustRef.value?.validate().catch(() => false))) return;
  const { direction, amount, note } = adjustForm.value;
  adjusting.value = true;
  try {
    const r = await port.adjust(props.accountUid, {
      delta: direction === 'grant' ? amount : -amount,
      note: note.trim(),
      requestId,
    });
    if (!r.success) {
      ElMessage.error(r.error.message);
      return;
    }
    ElMessage.success(`已${direction === 'grant' ? '发放' : '调减'}，可用 ${formatCredits(r.data.available)}`);
    adjustOpen.value = false;
    user?.refresh();
    if (page.value === 1) await load();
    else page.value = 1;
  } finally {
    adjusting.value = false;
  }
}

onMounted(() => void load());
</script>

<template>
  <FillListPageLayout embedded>
    <template #filters>
      <div class="toolbar">
        <el-button
          type="primary"
          @click="openAdjust"
        >
          发放 / 调减
        </el-button>
      </div>
    </template>

    <el-table
      v-loading="loading"
      :data="account?.txns.items ?? []"
      row-key="id"
      size="small"
      stripe
      height="100%"
      :empty-text="' '"
    >
      <el-table-column
        label="时间"
        width="172"
      >
        <template #default="{ row }: { row: CreditTxn }">
          <span class="mono cell-time">{{ formatDateTime(row.createdAt, 'YYYY-MM-DD HH:mm:ss') }}</span>
        </template>
      </el-table-column>
      <el-table-column
        label="类型"
        width="110"
      >
        <template #default="{ row }: { row: CreditTxn }">
          {{ CreditTxnKindLabel[row.kind] }}
        </template>
      </el-table-column>
      <el-table-column
        label="变动"
        width="140"
        align="right"
      >
        <template #default="{ row }: { row: CreditTxn }">
          <span
            class="num"
            :class="CREDIT_TXN_IN.has(row.kind) ? 'is-in' : 'is-out'"
          >{{ signed(row) }}</span>
        </template>
      </el-table-column>
      <el-table-column
        label="可用余额"
        width="140"
        align="right"
      >
        <template #default="{ row }: { row: CreditTxn }">
          <span class="num">{{ formatCredits(row.availableAfter) }}</span>
        </template>
      </el-table-column>
      <el-table-column
        label="来由"
        min-width="220"
      >
        <template #default="{ row }: { row: CreditTxn }">
          <div class="cell-source">
            <span>{{ CreditTxnSourceText[row.source.kind](row.source.ref) }}</span>
            <el-button
              v-if="row.source.kind === 'turn'"
              link
              type="primary"
              class="mono cell-link"
              title="在调用日志里看这一回合"
              @click="openTurn(row)"
            >
              {{ row.source.ref }}
            </el-button>
            <span
              v-else-if="row.source.kind === 'order'"
              class="mono cell-muted"
            >{{ row.source.ref }}</span>
          </div>
        </template>
      </el-table-column>
      <el-table-column
        label="备注"
        min-width="180"
      >
        <template #default="{ row }: { row: CreditTxn }">
          <span :class="{ 'cell-muted': !row.note }">{{ row.note ?? '—' }}</span>
        </template>
      </el-table-column>

      <template #empty>
        <EmptyState
          title="这个账户还没有积分流水"
          description="玩家买积分包或员工发放之后才会有。"
        />
      </template>
    </el-table>

    <template
      v-if="account"
      #footer
    >
      <el-pagination
        v-model:current-page="page"
        v-model:page-size="pageSize"
        :total="account.txns.total"
        :page-sizes="[20, 50, 100]"
        layout="total, sizes, prev, pager, next"
        background
      />
    </template>
  </FillListPageLayout>

  <el-dialog
    v-model="adjustOpen"
    title="发放 / 调减积分"
    width="440px"
    align-center
    :close-on-click-modal="false"
  >
    <el-form
      ref="adjustRef"
      :model="adjustForm"
      :rules="adjustRules"
      label-width="64px"
    >
      <el-form-item label="账户">
        <span class="mono">{{ accountUid }}</span>
      </el-form-item>
      <el-form-item label="方向">
        <el-radio-group v-model="adjustForm.direction">
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
          v-model="adjustForm.amount"
          :min="0.01"
          :precision="2"
          :step="100"
          controls-position="right"
        />
        <span
          v-if="adjustForm.direction === 'deduct'"
          class="form-hint"
        >最多扣到 0</span>
      </el-form-item>
      <el-form-item
        label="备注"
        prop="note"
      >
        <el-input
          v-model="adjustForm.note"
          type="textarea"
          :rows="2"
          maxlength="200"
          show-word-limit
          placeholder="补偿原因、工单号等"
        />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="adjustOpen = false">
        取消
      </el-button>
      <el-button
        type="primary"
        :loading="adjusting"
        @click="submitAdjust"
      >
        确定
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.mono {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
}

.toolbar {
  display: flex;
  justify-content: flex-end;
}

.num {
  font-variant-numeric: tabular-nums;
}

.cell-muted {
  color: var(--el-text-color-placeholder);
}

.cell-time {
  font-size: 12px;
  white-space: nowrap;
}

.cell-link {
  padding: 0;
  height: auto;
  font-size: 12px;
}

.cell-source {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.is-in {
  color: var(--el-color-success);
}

.is-out {
  color: var(--el-text-color-regular);
}

.form-hint {
  margin-left: 8px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>
