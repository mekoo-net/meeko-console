<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { computed, onMounted, ref, unref } from 'vue';

import PageHeader from '@/shared/ui/PageHeader.vue';
import { useAuthStore } from '@/stores/auth';
import { useBillingWorkspaceStore } from '@/stores/billingWorkspace';

import WalletTab from '../components/WalletTab.vue';
import OrdersTab from '../components/OrdersTab.vue';
import SubscriptionsTab from '../components/SubscriptionsTab.vue';
import InvoicesTab from '../components/InvoicesTab.vue';
import { useAccountDirectory } from '../composables/useAccountDirectory';

const auth = useAuthStore();
const billing = useBillingWorkspaceStore();
const { selectedAccountUid } = storeToRefs(billing);

const dir = useAccountDirectory();

const accountOptions = computed(() => dir.data.value?.items ?? []);
const dirAlert = computed(() => unref(dir.error));

const activeTab = ref('wallet');

onMounted(() => {
  if (selectedAccountUid.value === null && auth.accountUid) {
    billing.setSelectedAccountUid(auth.accountUid);
  }
});
</script>

<template>
  <div class="billing-page">
    <PageHeader title="计费工作台" description="钱包、订单、订阅与发票（Mock 数据按所选账户隔离）">
      <template #actions>
        <div class="billing-page__pick">
          <span class="billing-page__label">当前账户</span>
          <el-select
            :model-value="selectedAccountUid"
            placeholder="选择账户"
            filterable
            clearable
            style="width: 280px"
            @update:model-value="billing.setSelectedAccountUid"
          >
            <el-option
              v-for="a in accountOptions"
              :key="a.uid"
              :label="`${a.displayName} (${a.uid})`"
              :value="a.uid"
            />
          </el-select>
        </div>
      </template>
    </PageHeader>

    <el-alert
      v-if="dirAlert"
      :title="`账户列表加载失败：${dirAlert.code}`"
      :description="dirAlert.message"
      type="error"
      show-icon
      :closable="false"
      class="billing-page__warn"
    />

    <el-tabs v-model="activeTab" type="border-card" class="billing-page__tabs">
      <el-tab-pane label="钱包" name="wallet" lazy>
        <WalletTab :account-uid="selectedAccountUid" />
      </el-tab-pane>
      <el-tab-pane label="订单" name="orders" lazy>
        <OrdersTab :account-uid="selectedAccountUid" />
      </el-tab-pane>
      <el-tab-pane label="订阅" name="subs" lazy>
        <SubscriptionsTab :account-uid="selectedAccountUid" />
      </el-tab-pane>
      <el-tab-pane label="发票" name="inv" lazy>
        <InvoicesTab :account-uid="selectedAccountUid" />
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<style scoped>
.billing-page__pick {
  display: flex;
  align-items: center;
  gap: 10px;
}
.billing-page__label {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
.billing-page__warn {
  margin-bottom: 12px;
}
.billing-page__tabs {
  border-radius: 12px;
}
</style>
