<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { Delete, Plus } from '@element-plus/icons-vue';

import RateLimitAccountDialog from '@/features/demux/components/RateLimitAccountDialog.vue';
import RateSettingsPanel from '@/features/demux/components/RateSettingsPanel.vue';
import RateWindowInput from '@/features/demux/components/RateWindowInput.vue';
import { useRateLimitSettings } from '@/features/demux/composables/useRateLimitSettings';
import type { AccountRateLimitOverride } from '@/features/demux/model/rateLimit.types';
import { getAccountAdminPort } from '@/features/accounts/services';
import { accountTypeLabel, type Account, type AccountType } from '@/features/accounts/model/account.types';

const { draft, loading, saving, loaded, updatedAtUtc, isDirty, isDirtyAccount, load, save, resetAccount } =
  useRateLimitSettings();

const accountPort = getAccountAdminPort();
const dialogOpen = ref(false);

interface AccountBrief {
  displayName: string;
  email: string;
  type: AccountType;
}

/** UID → 账户展示信息（覆盖表格展示用，按需异步解析）。 */
const accountMap = reactive<Record<string, AccountBrief>>({});
const existingUids = computed(() => draft.overrides.map((o) => o.accountUid));

function briefTypeLabel(brief?: AccountBrief): string {
  return brief ? accountTypeLabel[brief.type] : '';
}

async function resolveAccounts(uids: string[]): Promise<void> {
  const pending = [...new Set(uids)].filter((uid) => uid && !(uid in accountMap));
  await Promise.all(
    pending.map(async (uid) => {
      const r = await accountPort.getAccount(uid);
      if (r.success) {
        accountMap[uid] = {
          displayName: r.data.displayName,
          email: r.data.owner.email ?? '',
          type: r.data.type,
        };
      }
    }),
  );
}

function onAccountPicked(account: Account): void {
  if (existingUids.value.includes(account.uid)) return;
  accountMap[account.uid] = {
    displayName: account.displayName,
    email: account.owner.email ?? '',
    type: account.type,
  };
  draft.overrides.unshift({ accountUid: account.uid, enabled: true, policy: { ...draft.defaultPolicy } });
}

function removeOverride(row: AccountRateLimitOverride): void {
  const idx = draft.overrides.indexOf(row);
  if (idx >= 0) draft.overrides.splice(idx, 1);
}

async function refresh(): Promise<void> {
  await load(true);
  void resolveAccounts(draft.overrides.map((o) => o.accountUid));
}

onMounted(async () => {
  await load();
  void resolveAccounts(draft.overrides.map((o) => o.accountUid));
});
</script>

<template>
  <RateSettingsPanel
    title="账户设置"
    description="按账户单独覆盖默认策略，未覆盖的账户使用总开关页的默认策略"
    :loading="loading"
    :loaded="loaded"
    :dirty="isDirty"
    :can-reset="isDirtyAccount"
    :saving="saving"
    :updated-at="updatedAtUtc"
    @refresh="refresh"
    @reset="resetAccount"
    @save="save"
  >
    <el-alert
      v-if="!draft.enabled"
      class="off-hint"
      type="info"
      show-icon
      :closable="false"
      title="账户限速总开关已关闭，以下覆盖将在开启后生效。"
    />

    <section class="section">
      <div class="section__head">
        <h4 class="section__title">
          账户覆盖
        </h4>
        <el-button
          :icon="Plus"
          type="primary"
          plain
          @click="dialogOpen = true"
        >
          添加账户
        </el-button>
      </div>

      <el-table
        :data="draft.overrides"
        empty-text="暂无账户覆盖"
      >
        <el-table-column
          label="账户"
          min-width="220"
        >
          <template #default="{ row }">
            <div class="acc__name">
              <span>{{ accountMap[row.accountUid]?.displayName || '未命名账户' }}</span>
              <el-tag
                v-if="accountMap[row.accountUid]"
                size="small"
                effect="plain"
                :type="accountMap[row.accountUid]?.type === 'organization' ? 'warning' : 'info'"
              >
                {{ briefTypeLabel(accountMap[row.accountUid]) }}
              </el-tag>
            </div>
            <div class="acc__sub">
              UID: {{ row.accountUid }}
              <template v-if="accountMap[row.accountUid]?.email">
                · {{ accountMap[row.accountUid]?.email }}
              </template>
            </div>
          </template>
        </el-table-column>

        <el-table-column
          label="启用"
          width="70"
          align="center"
        >
          <template #default="{ row }">
            <el-switch
              v-model="row.enabled"
              size="small"
            />
          </template>
        </el-table-column>

        <el-table-column
          label="统计窗口"
          min-width="180"
        >
          <template #default="{ row }">
            <RateWindowInput
              v-model:value="row.policy.windowValue"
              v-model:unit="row.policy.windowUnit"
              :disabled="!row.enabled"
            />
          </template>
        </el-table-column>

        <el-table-column
          label="请求数 / 窗口"
          min-width="130"
        >
          <template #default="{ row }">
            <el-input-number
              v-model="row.policy.maxRequests"
              :min="0"
              :step="10"
              :disabled="!row.enabled"
              controls-position="right"
              class="cell-num"
            />
          </template>
        </el-table-column>

        <el-table-column
          label="成功数 / 窗口"
          min-width="130"
        >
          <template #default="{ row }">
            <el-input-number
              v-model="row.policy.maxSuccesses"
              :min="0"
              :step="10"
              :disabled="!row.enabled"
              controls-position="right"
              class="cell-num"
            />
          </template>
        </el-table-column>

        <el-table-column
          label="并发数"
          min-width="110"
        >
          <template #default="{ row }">
            <el-input-number
              v-model="row.policy.maxConcurrency"
              :min="0"
              :step="1"
              :disabled="!row.enabled"
              controls-position="right"
              class="cell-num"
            />
          </template>
        </el-table-column>

        <el-table-column
          label="操作"
          width="72"
          align="center"
        >
          <template #default="{ row }">
            <el-button
              :icon="Delete"
              type="danger"
              text
              @click="removeOverride(row)"
            />
          </template>
        </el-table-column>
      </el-table>
    </section>

    <RateLimitAccountDialog
      v-model="dialogOpen"
      :existing-uids="existingUids"
      @select="onAccountPicked"
    />
  </RateSettingsPanel>
</template>

<style scoped>
.off-hint {
  margin-bottom: 16px;
}

.section__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 12px;
}

.section__title {
  margin: 0 0 12px;
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-regular);
}

.section__head .section__title {
  margin-bottom: 0;
}

.cell-num {
  width: 100%;
}

.acc__name {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 500;
}

.acc__sub {
  margin-top: 2px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>
