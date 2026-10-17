<script setup lang="ts">
import { ref, watch } from 'vue';
import { Delete, Lock, Unlock, WarningFilled } from '@element-plus/icons-vue';

import StatusTag from '@/shared/ui/StatusTag.vue';
import { formatDateTime } from '@/shared/lib/date';
import { formatMoney } from '@/shared/lib/money';

import {
  AttemptResultLabel,
  AttemptResultTone,
  CodeStatusLabel,
  CodeStatusTone,
  type RedemptionAttempt,
  type RedemptionCode,
} from '../model/redemption.types';
import { useRedemptionActions } from '../composables/useRedemptionActions';
import { summarizeUserAgent } from '../model/userAgent';
import { getRedemptionPort } from '../services';

const visible = defineModel<boolean>('visible', { required: true });
const props = defineProps<{ code: RedemptionCode | null }>();
const emit = defineEmits<{ (e: 'changed', code: RedemptionCode): void }>();

const port = getRedemptionPort();
const actions = useRedemptionActions();

/** 冻结 / 作废后就地替换，不必等父组件把新对象传回来。 */
const current = ref<RedemptionCode | null>(props.code);
watch(
  () => props.code,
  (c) => (current.value = c),
);

async function toggleFrozen(c: RedemptionCode): Promise<void> {
  const r = await actions.toggleCodeFrozen(c);
  if (!r) return;
  current.value = r;
  emit('changed', r);
}

async function voidIt(c: RedemptionCode): Promise<void> {
  const r = await actions.voidCode(c);
  if (!r) return;
  current.value = r;
  emit('changed', r);
}
const attempts = ref<RedemptionAttempt[]>([]);
const attemptsTotal = ref(0);
const loading = ref(false);

watch(
  () => [visible.value, props.code?.id] as const,
  async ([open, id]) => {
    if (!open || !id) return;
    loading.value = true;
    try {
      const r = await port.listAttempts({ page: 1, pageSize: 50, filter: { codeId: id } });
      attempts.value = r.success ? r.data.items : [];
      attemptsTotal.value = r.success ? r.data.total : 0;
    } finally {
      loading.value = false;
    }
  },
  { immediate: true },
);

const resale = (c: RedemptionCode) =>
  c.status === 'redeemed' && attempts.value.some((a) => a.result === 'already_redeemed' && a.account.uid !== c.redeemed?.account.uid);
</script>

<template>
  <el-drawer
    v-model="visible"
    size="560px"
    append-to-body
  >
    <template #header>
      <div
        v-if="current"
        class="head"
      >
        <div class="head__code">
          {{ current.codeMasked }}
        </div>
        <div class="head__meta">
          <StatusTag
            :label="CodeStatusLabel[current.status]"
            :tone="CodeStatusTone[current.status]"
          />
          <span class="head__value">{{ formatMoney(current.faceValue, { currency: 'CNY' }) }}</span>
          <span>{{ current.batchName }} · <code>{{ current.batchId }}</code></span>
        </div>
      </div>
    </template>

    <template v-if="current">
      <el-alert
        v-if="resale(current)"
        type="error"
        show-icon
        :closable="false"
        title="已兑换后仍被其他账户提交"
        class="alert"
      />
      <el-alert
        v-else-if="current.statusReason"
        :type="current.status === 'frozen' ? 'warning' : 'info'"
        show-icon
        :closable="false"
        :title="`${CodeStatusLabel[current.status]}：${current.statusReason}`"
        class="alert"
      />

      <h4 class="section">
        使用情况
      </h4>
      <el-descriptions
        v-if="current.redeemed"
        :column="1"
        size="small"
        border
        label-width="96px"
      >
        <el-descriptions-item label="账户">
          <span class="mono">{{ current.redeemed.account.uid }}</span>
          <span class="muted"> · {{ current.redeemed.account.email ?? '—' }}</span>
        </el-descriptions-item>
        <el-descriptions-item label="时间">
          {{ formatDateTime(current.redeemed.atUtc, 'YYYY-MM-DD HH:mm:ss') }}
        </el-descriptions-item>
        <el-descriptions-item label="业务">
          <span
            v-if="current.redeemed.productCode"
            class="mono"
          >{{ current.redeemed.productCode }}</span>
          <span
            v-else
            class="muted"
          >未指定</span>
        </el-descriptions-item>
        <el-descriptions-item label="IP">
          <span class="mono">{{ current.redeemed.ip }}</span>
        </el-descriptions-item>
        <el-descriptions-item label="设备">
          <div>
            <el-tag
              v-if="summarizeUserAgent(current.redeemed.userAgent).isScript"
              type="danger"
              size="small"
              effect="plain"
            >
              脚本 · {{ summarizeUserAgent(current.redeemed.userAgent).label }}
            </el-tag>
            <span v-else>{{ summarizeUserAgent(current.redeemed.userAgent).label }}</span>
          </div>
          <div class="ua">
            {{ current.redeemed.userAgent ?? '—' }}
          </div>
        </el-descriptions-item>
        <el-descriptions-item label="充值单号">
          <span class="mono">{{ current.redeemed.rechargeId }}</span>
          <span class="muted"> · 入账 {{ formatMoney(current.faceValue, { currency: 'CNY' }) }}</span>
        </el-descriptions-item>
      </el-descriptions>
      <div
        v-else
        class="empty"
      >
        尚未兑换
      </div>

      <h4 class="section">
        卡密信息
      </h4>
      <el-descriptions
        :column="2"
        size="small"
        border
      >
        <el-descriptions-item label="卡密 ID">
          <span class="mono">{{ current.id }}</span>
        </el-descriptions-item>
        <el-descriptions-item label="面值">
          {{ formatMoney(current.faceValue, { currency: 'CNY' }) }}
        </el-descriptions-item>
        <el-descriptions-item label="生成时间">
          {{ formatDateTime(current.createdAtUtc) }}
        </el-descriptions-item>
        <el-descriptions-item label="有效期至">
          {{ current.expiresAtUtc ? formatDateTime(current.expiresAtUtc) : '长期有效' }}
        </el-descriptions-item>
      </el-descriptions>

      <h4 class="section">
        兑换日志
        <span class="section__meta">共 {{ attemptsTotal }} 次<template v-if="current.failedAttempts"> · 失败 <b class="danger">{{ current.failedAttempts }}</b></template></span>
      </h4>
      <el-table
        v-loading="loading"
        :data="attempts"
        size="small"
        class="compact-table"
        max-height="320"
        empty-text="暂无提交"
      >
        <el-table-column
          label="时间"
          width="130"
        >
          <template #default="{ row }: { row: RedemptionAttempt }">
            {{ formatDateTime(row.atUtc, 'MM-DD HH:mm:ss') }}
          </template>
        </el-table-column>
        <el-table-column
          label="结果"
          width="110"
        >
          <template #default="{ row }: { row: RedemptionAttempt }">
            <StatusTag
              :label="AttemptResultLabel[row.result]"
              :tone="AttemptResultTone[row.result]"
            />
          </template>
        </el-table-column>
        <el-table-column
          label="账户"
          min-width="100"
        >
          <template #default="{ row }: { row: RedemptionAttempt }">
            <span class="mono">{{ row.account.uid }}</span>
            <el-icon
              v-if="current.redeemed && row.account.uid !== current.redeemed.account.uid"
              class="danger"
            >
              <WarningFilled />
            </el-icon>
          </template>
        </el-table-column>
        <el-table-column
          label="IP"
          min-width="120"
        >
          <template #default="{ row }: { row: RedemptionAttempt }">
            <span class="mono">{{ row.ip }}</span>
          </template>
        </el-table-column>
      </el-table>
    </template>

    <template #footer>
      <div
        v-if="current"
        class="foot"
      >
        <el-button
          :icon="current.status === 'frozen' ? Unlock : Lock"
          :disabled="current.status !== 'unused' && current.status !== 'frozen'"
          @click="toggleFrozen(current)"
        >
          {{ current.status === 'frozen' ? '解除冻结' : '冻结' }}
        </el-button>
        <el-button
          type="danger"
          plain
          :icon="Delete"
          :disabled="current.status !== 'unused' && current.status !== 'frozen'"
          @click="voidIt(current)"
        >
          作废
        </el-button>
      </div>
    </template>
  </el-drawer>
</template>

<style scoped>
.head {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.head__code {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 18px;
  font-weight: 700;
  letter-spacing: 0.5px;
  color: var(--el-text-color-primary);
}
.head__meta {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.head__value {
  font-weight: 600;
  color: var(--el-text-color-primary);
}
code,
.mono {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 12px;
}
.muted {
  color: var(--el-text-color-secondary);
}
.ua {
  margin-top: 2px;
  font-size: 11.5px;
  line-height: 1.4;
  word-break: break-all;
  color: var(--el-text-color-placeholder);
}
.alert {
  margin-bottom: 4px;
}
.section {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin: 18px 0 10px;
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}
.section__meta {
  font-size: 12px;
  font-weight: 400;
  color: var(--el-text-color-secondary);
}
.danger {
  color: var(--el-color-danger);
  vertical-align: middle;
  margin-left: 4px;
}
.empty {
  padding: 12px;
  font-size: 12px;
  color: var(--el-text-color-placeholder);
  border: 1px dashed var(--el-border-color);
  border-radius: 6px;
  text-align: center;
}
.foot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
