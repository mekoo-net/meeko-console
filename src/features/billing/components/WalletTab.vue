<script setup lang="ts">
import { ElMessage } from 'element-plus';
import { computed, ref, toRef, unref } from 'vue';

import DataTableShell from '@/shared/ui/DataTableShell.vue';
import MoneyText from '@/shared/ui/MoneyText.vue';
import { confirmDanger } from '@/shared/composables/useConfirm';
import { formatDateTime } from '@/shared/lib/date';

import { useRecharge } from '../composables/useRecharge';
import { useWallet } from '../composables/useWallet';

const props = defineProps<{ accountUid: string | null }>();

const uidRef = toRef(props, 'accountUid');
const walletState = useWallet(uidRef);
const rechargeState = useRecharge(uidRef);

const loading = computed(() => unref(walletState.loading));
const error = computed(() => unref(walletState.error));
const snapshot = computed(() => unref(walletState.data) ?? null);
const rechargeBusy = computed(() => unref(rechargeState.loading));

const dialogVisible = ref(false);
const amountInput = ref('100');

async function openRecharge(): Promise<void> {
  amountInput.value = '100';
  dialogVisible.value = true;
}

async function submitRecharge(): Promise<void> {
  const n = Number(amountInput.value);
  if (!Number.isFinite(n) || n <= 0) {
    ElMessage.warning('请输入有效金额');
    return;
  }
  if (n >= 5000) {
    const ok = await confirmDanger({
      title: '大额充值确认',
      message: `将为当前账户发起 ¥${n.toFixed(2)} 的充值（Mock）。是否继续？`,
      type: 'warning',
    });
    if (!ok) return;
  }
  const r = await rechargeState.create({ amount: n });
  if (r.success) {
    ElMessage.success('充值意图已创建（Mock）');
    dialogVisible.value = false;
    void walletState.run();
  } else {
    ElMessage.error(r.error.message);
  }
}
</script>

<template>
  <DataTableShell
    :loading="loading"
    :error="error"
    :items="snapshot ? [snapshot] : []"
    empty-title="未选择账户或暂无钱包数据"
  >
    <template #toolbar>
      <el-button type="primary" :disabled="!accountUid" @click="openRecharge">充值（Mock）</el-button>
      <el-button :disabled="!accountUid" @click="walletState.run()">刷新</el-button>
    </template>

    <template v-if="snapshot">
      <el-descriptions :column="2" border>
        <el-descriptions-item label="可用余额">
          <MoneyText
            :value="snapshot.available"
            :options="{ currency: snapshot.currency }"
          />
        </el-descriptions-item>
        <el-descriptions-item label="冻结">
          <MoneyText
            :value="snapshot.held"
            :options="{ currency: snapshot.currency }"
          />
        </el-descriptions-item>
        <el-descriptions-item label="币种">{{ snapshot.currency }}</el-descriptions-item>
        <el-descriptions-item label="更新时间 UTC">
          {{ formatDateTime(snapshot.updatedAtUtc) }}
        </el-descriptions-item>
      </el-descriptions>
    </template>
  </DataTableShell>

  <el-dialog v-model="dialogVisible" title="创建充值意图" width="420px" destroy-on-close>
    <el-form label-width="88px">
      <el-form-item label="金额（元）">
        <el-input v-model="amountInput" type="number" placeholder="例如 100" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="dialogVisible = false">取消</el-button>
      <el-button type="primary" :loading="rechargeBusy" @click="submitRecharge">确认</el-button>
    </template>
  </el-dialog>
</template>
