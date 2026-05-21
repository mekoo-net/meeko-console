<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { CopyDocument, Delete, Download } from '@element-plus/icons-vue';

import { formatDateTime } from '@/shared/lib/date';
import { formatQuota } from '@/shared/lib/quota';
import StatusTag from '@/shared/ui/StatusTag.vue';

import {
  isSharedRedemptionCode,
  redemptionClaimsOf,
  type RedemptionClaim,
  type RedemptionCode,
} from '../model/redemption.types';
import {
  maskRedemptionKey,
  redemptionDisplayStatus,
  redemptionProgressPercent,
  redemptionProgressText,
} from '../model/redemptionDisplay';

const visible = defineModel<boolean>('visible', { required: true });

const props = defineProps<{
  row: RedemptionCode;
}>();

const emit = defineEmits<{
  (e: 'remove', row: RedemptionCode): void;
  (e: 'closed'): void;
}>();

const router = useRouter();
const row = computed(() => props.row);

const claims = computed(() => redemptionClaimsOf(row.value));

const displayStatus = computed(() => redemptionDisplayStatus(row.value));

const progressPercent = computed(() =>
  isSharedRedemptionCode(row.value) ? redemptionProgressPercent(row.value) : 0,
);

function claimRowKey(claim: RedemptionClaim, index: number): string {
  return `${claim.account?.uid ?? 'claim'}-${claim.redeemedTime ?? index}`;
}

function formatTs(sec: number | null): string {
  if (!sec) return '—';
  return formatDateTime(new Date(sec * 1000).toISOString());
}

async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    ElMessage.success('已复制');
  } catch {
    ElMessage.error('复制失败');
  }
}

function exportClaimsCsv(): void {
  if (!claims.value.length) return;
  const header = 'email,uid,redeemed_time\n';
  const lines = claims.value.map((c) => {
    const email = c.account.owner?.email ?? '';
    const uid = c.account.uid;
    const time = formatTs(c.redeemedTime);
    return `"${email}","${uid}","${time}"`;
  });
  const blob = new Blob([header + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${row.value.name.replace(/\s+/g, '-')}-claims.csv`;
  a.click();
  URL.revokeObjectURL(url);
  ElMessage.success('已导出领取记录');
}
</script>

<template>
  <el-drawer
    v-model="visible"
    :title="row.name"
    direction="rtl"
    size="520px"
    append-to-body
    class="redemption-detail-drawer"
    @closed="emit('closed')"
  >
    <div class="detail-body">
      <div class="detail-header">
        <StatusTag :label="displayStatus.label" :tone="displayStatus.tone" />
        <el-tag v-if="isSharedRedemptionCode(row)" size="small" type="warning" effect="plain" round>
          活动码
        </el-tag>
        <span class="detail-header__id">#{{ row.id }}</span>
      </div>

      <div class="code-block">
        <div class="code-block__label">激活码</div>
        <div class="code-block__row">
          <code class="code-block__key">{{ row.key }}</code>
          <el-button type="primary" size="small" :icon="CopyDocument" @click="copyText(row.key)">
            复制
          </el-button>
        </div>
        <div class="code-block__hint">列表中显示为 {{ maskRedemptionKey(row.key) }}</div>
      </div>

      <div v-if="isSharedRedemptionCode(row)" class="progress-block">
        <div class="progress-block__head">
          <span>领取进度</span>
          <span class="progress-block__nums">{{ redemptionProgressText(row) }}</span>
        </div>
        <el-progress
          :percentage="progressPercent"
          :stroke-width="10"
          :status="row.redeemedCount >= row.maxRedemptions ? 'success' : undefined"
        />
      </div>

      <el-divider />

      <h4 class="section-title">规则</h4>
      <div class="detail-row">
        <span class="detail-row__label">每次额度</span>
        <span class="detail-row__value detail-row__value--money">{{ formatQuota(row.quota) }}</span>
      </div>
      <div class="detail-row">
        <span class="detail-row__label">可领次数</span>
        <span class="detail-row__value">{{ row.maxRedemptions }}</span>
      </div>
      <div class="detail-row">
        <span class="detail-row__label">截止领取</span>
        <span class="detail-row__value">
          {{ row.expiredTime ? formatTs(row.expiredTime).slice(0, 16) : '长期有效' }}
        </span>
      </div>

      <el-divider />

      <h4 class="section-title">创建信息</h4>
      <div class="detail-row">
        <span class="detail-row__label">创建人</span>
        <span class="detail-row__value">
          {{ row.createdBy.displayName }}
          <template v-if="row.createdBy.username"> · @{{ row.createdBy.username }}</template>
        </span>
      </div>
      <div class="detail-row">
        <span class="detail-row__label">创建时间</span>
        <span class="detail-row__value">{{ formatTs(row.createdTime) }}</span>
      </div>

      <el-divider />

      <div class="claims-head">
        <h4 class="section-title">领取记录</h4>
        <el-button
          v-if="claims.length"
          size="small"
          :icon="Download"
          @click="exportClaimsCsv"
        >
          导出 CSV
        </el-button>
      </div>

      <div v-if="claims.length" class="claims-list">
        <div v-for="(c, idx) in claims" :key="claimRowKey(c, idx)" class="claims-list__row">
          <div class="claims-list__user">
            <span class="claims-list__email">{{ c.account.owner?.email ?? '—' }}</span>
            <el-button
              link
              type="primary"
              class="claims-list__uid"
              @click="router.push(`/accounts/${c.account.uid}`)"
            >
              {{ c.account.uid }}
            </el-button>
          </div>
          <span class="claims-list__time">{{ formatTs(c.redeemedTime) }}</span>
        </div>
      </div>
      <div v-else class="claims-empty">暂无领取记录</div>

      <template v-if="!isSharedRedemptionCode(row) && row.account">
        <el-divider />
        <h4 class="section-title">领取人</h4>
        <div class="detail-row">
          <span class="detail-row__label">邮箱</span>
          <span class="detail-row__value">{{ row.account.owner?.email ?? '—' }}</span>
        </div>
        <div class="detail-row">
          <span class="detail-row__label">账户</span>
          <el-button link type="primary" @click="router.push(`/accounts/${row.account!.uid}`)">
            {{ row.account.uid }}
          </el-button>
        </div>
        <div class="detail-row">
          <span class="detail-row__label">领取时间</span>
          <span class="detail-row__value">{{ formatTs(row.redeemedTime) }}</span>
        </div>
      </template>
    </div>

    <template #footer>
      <div class="drawer-footer">
        <el-tooltip content="已有领取记录不可删除" :disabled="row.redeemedCount === 0">
          <el-button
            type="danger"
            plain
            :icon="Delete"
            :disabled="row.redeemedCount > 0"
            @click="emit('remove', row)"
          >
            删除
          </el-button>
        </el-tooltip>
        <el-button @click="visible = false">关闭</el-button>
      </div>
    </template>
  </el-drawer>
</template>

<style scoped>
.detail-header {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}
.detail-header__id {
  font-size: 12px;
  color: var(--el-text-color-placeholder);
  font-variant-numeric: tabular-nums;
}

.code-block {
  padding: 14px 16px;
  border-radius: 10px;
  background: #f8fafc;
  border: 1px solid var(--el-border-color-lighter);
  margin-bottom: 16px;
}
.code-block__label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-bottom: 8px;
}
.code-block__row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}
.code-block__key {
  flex: 1;
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 13px;
  word-break: break-all;
  line-height: 1.45;
  color: #0f172a;
}
.code-block__hint {
  margin-top: 8px;
  font-size: 12px;
  color: var(--el-text-color-placeholder);
}

.progress-block {
  margin-bottom: 8px;
}
.progress-block__head {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  margin-bottom: 8px;
  color: var(--el-text-color-regular);
}
.progress-block__nums {
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.section-title {
  margin: 0 0 12px;
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.detail-row {
  display: flex;
  align-items: baseline;
  gap: 12px;
  margin-bottom: 10px;
  font-size: 13px;
}
.detail-row__label {
  flex: 0 0 88px;
  color: var(--el-text-color-secondary);
}
.detail-row__value {
  flex: 1;
  color: var(--el-text-color-primary);
}
.detail-row__value--money {
  font-weight: 600;
  color: var(--el-color-success);
}

.claims-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}
.claims-head .section-title {
  margin: 0;
}

.claims-list {
  max-height: 320px;
  overflow: auto;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
}
.claims-list__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--el-border-color-extra-light);
  font-size: 13px;
}
.claims-list__row:last-child {
  border-bottom: none;
}
.claims-list__user {
  display: flex;
  flex-direction: column;
  min-width: 0;
  line-height: 1.35;
}
.claims-list__email {
  font-weight: 500;
}
.claims-list__uid {
  padding: 0;
  height: auto;
  font-size: 12px;
  justify-content: flex-start;
}
.claims-list__time {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
}

.claims-empty {
  font-size: 13px;
  color: var(--el-text-color-placeholder);
  padding: 12px 0;
}

.drawer-footer {
  display: flex;
  justify-content: space-between;
  width: 100%;
}
</style>
