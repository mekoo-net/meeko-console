<script setup lang="ts">
/**
 * Tavern 积分账户：按账户 UID 看余额和全部流水（含回合的预扣与退回），员工发放 / 调减。
 * UID 跟着 `?uid=` 走，调用日志等处可以直接带过来；回合流水点得回调用日志看那一回合。
 */
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import { Search } from '@element-plus/icons-vue';

import PageHeader from '@/shared/ui/PageHeader.vue';
import EmptyState from '@/shared/ui/EmptyState.vue';
import FillListPageLayout from '@/shared/ui/FillListPageLayout.vue';
import { formatDateTime } from '@/shared/lib/date';

import { CREDIT_TXN_IN, CreditTxnKindLabel, type CreditAccount, type CreditTxn } from '../model/credits.types';
import { formatCredits, parseAccountUid } from '../model/meteringFormat';
import { getTavernCreditsPort } from '../services';

const port = getTavernCreditsPort();
const route = useRoute();
const router = useRouter();

const uidInput = ref('');
const account = ref<CreditAccount | null>(null);
const loading = ref(false);
const page = ref(1);
const pageSize = ref(20);

const uid = computed<number | null>(() => {
  const raw = route.query.uid;
  const text = Array.isArray(raw) ? raw[0] : raw;
  return text && /^\d+$/.test(text) ? Number(text) : null;
});

async function load(): Promise<void> {
  if (uid.value == null) {
    account.value = null;
    return;
  }
  loading.value = true;
  try {
    const r = await port.account(uid.value, page.value, pageSize.value);
    if (r.success) account.value = r.data;
    else ElMessage.error(r.error.message);
  } finally {
    loading.value = false;
  }
}

function search(): void {
  const parsed = parseAccountUid(uidInput.value);
  if (!parsed.ok || parsed.value == null) {
    ElMessage.warning('账户 UID 只能是数字');
    return;
  }
  page.value = 1;
  void router.replace({ query: { ...route.query, uid: String(parsed.value) } });
}

watch(uid, (v) => {
  uidInput.value = v == null ? '' : String(v);
  void load();
});
watch([page, pageSize], () => void load());

function signed(t: CreditTxn): string {
  return `${CREDIT_TXN_IN.has(t.kind) ? '+' : '−'}${formatCredits(t.amount)}`;
}

function sourceText(t: CreditTxn): string {
  switch (t.source.kind) {
    case 'turn':
      return '回合';
    case 'order':
      return '订单';
    case 'staff':
      return `员工 ${t.source.ref}`;
  }
}

function openTurn(t: CreditTxn): void {
  void router.push({ path: '/tavern/logs', query: { traceId: t.source.ref } });
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
  note: [{ required: true, message: '写一下为什么调整', trigger: 'blur' }],
};

function openAdjust(): void {
  adjustForm.value = { direction: 'grant', amount: 100, note: '' };
  requestId = crypto.randomUUID();
  adjustOpen.value = true;
}

async function submitAdjust(): Promise<void> {
  if (uid.value == null || !(await adjustRef.value?.validate().catch(() => false))) return;
  const { direction, amount, note } = adjustForm.value;
  adjusting.value = true;
  try {
    const r = await port.adjust(uid.value, {
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
    page.value = 1;
    await load();
  } finally {
    adjusting.value = false;
  }
}

onMounted(() => {
  uidInput.value = uid.value == null ? '' : String(uid.value);
  void load();
});
</script>

<template>
  <FillListPageLayout>
    <template #header>
      <PageHeader title="积分账户" />
    </template>

    <template #filters>
      <div class="lookup">
        <el-input
          v-model="uidInput"
          :prefix-icon="Search"
          placeholder="账户 UID"
          clearable
          class="mono-input"
          style="width: 240px"
          @keyup.enter="search"
        />
        <el-button
          type="primary"
          @click="search"
        >
          查询
        </el-button>
      </div>

      <section
        v-if="account"
        class="balance"
      >
        <div class="balance__item">
          <span class="balance__label">可用</span>
          <span class="balance__value num">{{ formatCredits(account.balance.available) }}</span>
        </div>
        <div class="balance__item">
          <span class="balance__label">预扣中</span>
          <span class="balance__value balance__value--sub num">{{ formatCredits(account.balance.held) }}</span>
        </div>
        <el-button
          class="balance__action"
          @click="openAdjust"
        >
          发放 / 调减
        </el-button>
      </section>
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
            <span>{{ sourceText(row) }}</span>
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
          :title="uid == null ? '输入账户 UID 查询' : '这个账户还没有积分流水'"
          :description="uid == null ? '' : '玩家买积分包或员工发放之后才会有。'"
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
        <span class="mono">{{ uid }}</span>
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

.mono-input :deep(.el-input__inner) {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
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

.lookup {
  display: flex;
  align-items: center;
  gap: 8px;
}

.balance {
  display: flex;
  align-items: center;
  gap: 12px;
}

.balance__item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 160px;
  padding: 10px 14px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  background: var(--el-bg-color);
}

.balance__label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.balance__value {
  font-size: 18px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.balance__value--sub {
  font-weight: 500;
  color: var(--el-text-color-regular);
}

.balance__action {
  margin-left: auto;
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
