<script setup lang="ts">
import { computed, inject, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';

import StatusTag from '@/shared/ui/StatusTag.vue';
import { formatMoney } from '@/shared/lib/money';
import { formatDateTime } from '@/shared/lib/date';

import { AccountDetailKey } from '../../../composables/accountDetailContext';
import type { ReferralInvitee } from '../../../model/referral.types';
import { accountTypeLabel } from '../../../model/account.types';
import { getReferralAdminPort } from '../../../services';

const ctx = inject(AccountDetailKey);
const router = useRouter();
const referralPort = getReferralAdminPort();

const account = computed(() => ctx?.account.value ?? null);

const invitees = ref<ReferralInvitee[]>([]);
const loading = ref(false);
const page = ref(1);
const pageSize = ref(20);
const total = ref(0);
const currency = ref('CNY');

async function load(): Promise<void> {
  const uid = account.value?.uid;
  if (!uid) return;
  loading.value = true;
  try {
    const [i, s] = await Promise.all([
      referralPort.listInvitees(uid, { page: page.value, pageSize: pageSize.value }),
      referralPort.getSummary(uid),
    ]);
    if (i.success) {
      invitees.value = i.data.items;
      total.value = i.data.total;
    }
    if (s.success) currency.value = s.data.currency;
  } finally {
    loading.value = false;
  }
}

function openInvitee(uid: string): void {
  void router.push(`/accounts/${uid}`);
}

watch([page, pageSize], () => void load());
watch(() => account.value?.uid, () => {
  page.value = 1;
  void load();
});

onMounted(() => void load());
</script>

<template>
  <div class="acc-page">
    <div class="acc-table-wrap">
      <el-table
        v-loading="loading"
        :data="invitees"
        row-key="accountUid"
        size="small"
        height="100%"
        class="compact-table"
        empty-text="暂无邀请记录"
      >
        <el-table-column label="被邀请账户" min-width="240">
          <template #default="{ row }: { row: ReferralInvitee }">
            <div class="ref-contact">
              <div class="ref-contact__name">
                <button type="button" class="ref-link" @click="openInvitee(row.accountUid)">
                  {{ row.displayName || row.email || row.accountUid }}
                </button>
                <el-tag
                  v-if="row.type"
                  :type="row.type === 'organization' ? 'primary' : 'info'"
                  size="small"
                  effect="light"
                  round
                >
                  {{ accountTypeLabel[row.type] }}
                </el-tag>
              </div>
              <div class="ref-contact__uid">UID {{ row.accountUid }}</div>
              <div v-if="row.email" class="ref-contact__email">{{ row.email }}</div>
              <div v-if="row.phone" class="ref-contact__phone">{{ row.phone }}</div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="注册时间" width="170">
          <template #default="{ row }: { row: ReferralInvitee }">
            <span class="cell-date">{{ formatDateTime(row.registeredAtUtc) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="最近登录时间" width="170">
          <template #default="{ row }: { row: ReferralInvitee }">
            <span class="cell-date">
              {{ row.lastLoginAtUtc ? formatDateTime(row.lastLoginAtUtc) : '—' }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="最近登录 IP" width="150">
          <template #default="{ row }: { row: ReferralInvitee }">
            <span class="cell-ip">{{ row.lastLoginIp || '—' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="已充值" width="90" align="center">
          <template #default="{ row }: { row: ReferralInvitee }">
            <el-tag :type="row.hasRecharged ? 'success' : 'info'" size="small" effect="plain" round>
              {{ row.hasRecharged ? '是' : '否' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="贡献返利" width="130" align="right">
          <template #default="{ row }: { row: ReferralInvitee }">
            <span class="cell-money cell-money--in">
              {{ formatMoney(row.contributedRebateAmount, { currency }) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }: { row: ReferralInvitee }">
            <StatusTag
              :label="row.status === 'active' ? '活跃' : '已停用'"
              :tone="row.status === 'active' ? 'success' : 'warning'"
            />
          </template>
        </el-table-column>
      </el-table>
    </div>

    <div class="pagination-bar">
      <el-pagination
        v-model:current-page="page"
        v-model:page-size="pageSize"
        :total="total"
        :page-sizes="[20, 50, 100]"
        layout="total, sizes, prev, pager, next"
        background
      />
    </div>
  </div>
</template>

<style scoped>
.ref-contact {
  display: flex;
  flex-direction: column;
  gap: 2px;
  line-height: 1.35;
}
.ref-contact__name {
  display: flex;
  align-items: center;
  gap: 6px;
}
.ref-link {
  border: none;
  background: none;
  padding: 0;
  color: var(--el-color-primary);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  text-align: left;
}
.ref-contact__uid {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.ref-contact__email {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.ref-contact__phone {
  font-size: 13px;
  color: var(--el-text-color-primary);
  font-variant-numeric: tabular-nums;
}
.cell-ip {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 13px;
  color: var(--el-text-color-regular);
}
.cell-money--in {
  color: var(--el-color-success);
}
</style>
