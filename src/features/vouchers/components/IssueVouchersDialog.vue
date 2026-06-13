<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';

import LargeDialog from '@/shared/ui/LargeDialog.vue';
import { getAccountAdminPort } from '@/features/accounts/services';
import type { Account } from '@/features/accounts/model/account.types';
import { TIER_THRESHOLDS } from '@/features/accounts/model/tierConfig';
import { ACHIEVEMENT_CATALOG, findAchievementDef } from '@/features/accounts/model/achievementCatalog';

import type { IssueVouchersResult, VoucherTemplate } from '../model/voucher.types';
import { getVoucherPort } from '../services';

const props = defineProps<{
  modelValue: boolean;
  template?: VoucherTemplate | null;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  issued: [result: IssueVouchersResult];
}>();

const voucherPort = getVoucherPort();
const accountPort = getAccountAdminPort();

const visible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value),
});

interface TransferItem {
  key: string;
  label: string;
  uid: string;
  email: string;
  tierName: string;
  badges: string;
}

/** 候选用户全量（一次拉取，等级/徽章前端筛选；大体量后端应补服务端过滤）。 */
const allAccounts = ref<Account[]>([]);
const loading = ref(false);
const submitting = ref(false);

const filters = reactive({
  tier: '' as number | '',
  badge: '',
});

const targetKeys = ref<string[]>([]);

function tierName(tier: number): string {
  return TIER_THRESHOLDS.find((t) => t.level === tier)?.name ?? `Lv${tier}`;
}

function badgeIcons(account: Account): string {
  return (account.achievements ?? [])
    .map((m) => findAchievementDef(m.code)?.icon ?? '')
    .filter(Boolean)
    .join(' ');
}

function toItem(a: Account): TransferItem {
  return {
    key: a.uid,
    label: a.displayName || a.uid,
    uid: a.uid,
    email: a.ownerEmail ?? '',
    tierName: tierName(a.tier),
    badges: badgeIcons(a),
  };
}

// 候选 = 通过等级/徽章筛选的用户 ∪ 已选用户（保证已选项始终可见、不被筛选隐藏）。
const transferData = computed<TransferItem[]>(() => {
  const selected = new Set(targetKeys.value);
  return allAccounts.value
    .filter((a) => {
      if (selected.has(a.uid)) return true;
      if (filters.tier !== '' && a.tier !== filters.tier) return false;
      if (filters.badge && !(a.achievements ?? []).some((m) => m.code === filters.badge)) return false;
      return true;
    })
    .map(toItem);
});

function filterMethod(query: string, item: TransferItem): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    item.label.toLowerCase().includes(q) ||
    item.uid.includes(query.trim()) ||
    item.email.toLowerCase().includes(q)
  );
}

watch(
  () => props.modelValue,
  (open) => {
    if (open) void reset();
  },
);

async function reset(): Promise<void> {
  filters.tier = '';
  filters.badge = '';
  targetKeys.value = [];
  await loadAccounts();
}

async function loadAccounts(): Promise<void> {
  loading.value = true;
  try {
    const r = await accountPort.listAccounts({
      page: 1,
      pageSize: 500,
      filter: { accountUid: '', contactKeyword: '', type: 'all', status: 'active' },
    });
    allAccounts.value = r.success ? r.data.items : [];
    if (!r.success) ElMessage.error(r.error.message);
  } finally {
    loading.value = false;
  }
}

async function onSubmit(): Promise<void> {
  if (!props.template) return;
  const accountUids = [...targetKeys.value];
  if (accountUids.length === 0) {
    ElMessage.warning('请先选择至少一个账户');
    return;
  }
  submitting.value = true;
  try {
    const r = await voucherPort.issue(props.template.id, { accountUids });
    if (r.success) {
      ElMessage.success(`已发放 ${r.data.issuedCount} / ${r.data.requestedCount} 张`);
      emit('issued', r.data);
      visible.value = false;
    } else {
      ElMessage.error(r.error.message);
    }
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <LargeDialog
    v-model="visible"
    :title="template ? `下发代金券 · ${template.name}` : '下发代金券'"
  >
    <div
      v-loading="loading"
      class="issue-wrap lg-fill"
    >
      <div class="filters">
        <span class="filters__label">筛选候选用户</span>
        <el-select
          v-model="filters.tier"
          placeholder="用户等级"
          clearable
          size="small"
          style="width: 140px"
        >
          <el-option
            v-for="t in TIER_THRESHOLDS"
            :key="t.level"
            :label="t.name"
            :value="t.level"
          />
        </el-select>
        <el-select
          v-model="filters.badge"
          placeholder="用户徽章"
          clearable
          filterable
          size="small"
          style="width: 180px"
        >
          <el-option
            v-for="b in ACHIEVEMENT_CATALOG"
            :key="b.code"
            :label="`${b.icon} ${b.name}`"
            :value="b.code"
          />
        </el-select>
        <span class="filters__hint">用户 ID / 邮箱 / 名称可在下方面板搜索框检索</span>
      </div>

      <el-transfer
        v-model="targetKeys"
        :data="transferData"
        :titles="['候选用户', '已选用户']"
        :button-texts="['移除', '添加']"
        :filter-method="filterMethod"
        filterable
        filter-placeholder="搜索 用户ID / 邮箱 / 名称"
        target-order="push"
        class="issue-transfer lg-fill"
      >
        <template #default="{ option }: { option: TransferItem }">
          <div class="ti">
            <span class="ti__name">{{ option.label }}</span>
            <span class="ti__meta">
              {{ option.uid }}
              <template v-if="option.email"> · {{ option.email }}</template>
              · {{ option.tierName }}
              <span
                v-if="option.badges"
                class="ti__badges"
              >{{ option.badges }}</span>
            </span>
          </div>
        </template>
      </el-transfer>
    </div>

    <template #footer>
      <div class="issue-foot">
        <span class="foot-hint">将向已选 {{ targetKeys.length }} 个账户各发放 1 张（重复下发幂等不重复）</span>
        <el-button @click="visible = false">
          取消
        </el-button>
        <el-button
          type="primary"
          :loading="submitting"
          :disabled="targetKeys.length === 0"
          @click="onSubmit"
        >
          下发（{{ targetKeys.length }}）
        </el-button>
      </div>
    </template>
  </LargeDialog>
</template>

<style scoped>
.issue-wrap {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.filters {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.filters__label {
  font-weight: 600;
}
.filters__hint {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.ti {
  display: flex;
  flex-direction: column;
  line-height: 1.3;
  padding: 2px 0;
}
.ti__name {
  font-weight: 500;
}
.ti__meta {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.ti__badges {
  margin-left: 4px;
  letter-spacing: 1px;
}

/* 让穿梭框撑满大弹窗高度，两侧面板等宽自适应。 */
.issue-transfer {
  display: flex;
}
.issue-transfer :deep(.el-transfer) {
  display: flex;
  align-items: stretch;
  width: 100%;
}
.issue-transfer :deep(.el-transfer-panel) {
  flex: 1;
  width: auto;
  display: flex;
  flex-direction: column;
}
.issue-transfer :deep(.el-transfer-panel__body) {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.issue-transfer :deep(.el-transfer-panel__list) {
  flex: 1;
  min-height: 0;
  height: auto;
}
.issue-transfer :deep(.el-transfer-panel__item) {
  height: auto;
  display: flex;
  align-items: center;
}
.issue-transfer :deep(.el-transfer-panel__item .el-checkbox__label) {
  white-space: normal;
  line-height: 1.3;
}
.issue-transfer :deep(.el-transfer__buttons) {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 10px;
}
.issue-foot {
  display: flex;
  align-items: center;
  gap: 12px;
}
.foot-hint {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-right: auto;
}
</style>
