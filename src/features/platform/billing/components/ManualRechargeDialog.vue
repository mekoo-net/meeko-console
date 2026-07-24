<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';

import type { BillingProduct } from '@/features/platform/products/model/product.types';
import { getProductPort } from '@/features/platform/products/services';

import {
  RechargeProviderLabel,
  type RechargeProvider,
} from '../model/billing.types';
import { getBillingPort } from '../services';

const props = defineProps<{
  visible: boolean;
  accountUid: string;
  accountLabel?: string;
}>();
const emit = defineEmits<{
  (e: 'update:visible', v: boolean): void;
  (e: 'success'): void;
}>();

const internalSources: RechargeProvider[] = ['manual', 'cs_compensation', 'marketing_reward'];

const billingPort = getBillingPort();
const productPort = getProductPort();
const submitting = ref(false);

const amount = ref<number | null>(null);
const source = ref<RechargeProvider>('manual');
const note = ref('');
const idempotencyKey = ref('');
const productCode = ref('');

const products = ref<BillingProduct[]>([]);
const productsLoading = ref(false);

/** 仅「人工充值」需要选择入账业务：用于按业务返利率触发邀请返利。 */
const showProductSelect = computed(() => source.value === 'manual');

async function loadProducts(): Promise<void> {
  if (products.value.length || productsLoading.value) return;
  productsLoading.value = true;
  try {
    const r = await productPort.list();
    if (r.success) products.value = r.data.filter((p) => p.active);
  } finally {
    productsLoading.value = false;
  }
}

watch(source, (next) => {
  if (next !== 'manual') {
    productCode.value = '';
  } else {
    void loadProducts();
  }
});

const dialogVisible = computed({
  get: () => props.visible,
  set: (v) => emit('update:visible', v),
});

const targetLabel = computed(() => props.accountLabel?.trim() || props.accountUid);

function resetForm(): void {
  amount.value = null;
  source.value = 'manual';
  note.value = '';
  idempotencyKey.value = '';
  productCode.value = '';
}

watch(
  () => props.visible,
  (open) => {
    if (open) {
      resetForm();
      void loadProducts();
    }
  },
);

async function handleSubmit(): Promise<void> {
  if (!props.accountUid) {
    ElMessage.warning('缺少目标账户');
    return;
  }
  if (amount.value == null || amount.value <= 0) {
    ElMessage.warning('请输入大于 0 的入账金额');
    return;
  }

  submitting.value = true;
  try {
    const r = await billingPort.createInternalRecharge({
      ownerAccountUid: props.accountUid,
      amount: amount.value,
      source: source.value,
      note: note.value.trim() || undefined,
      idempotencyKey: idempotencyKey.value.trim() || undefined,
      productCode: showProductSelect.value ? productCode.value.trim() || undefined : undefined,
    });
    if (r.success) {
      ElMessage.success('人工入账成功');
      emit('success');
      dialogVisible.value = false;
    } else {
      ElMessage.error(r.error.message);
    }
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <el-dialog
    v-model="dialogVisible"
    title="人工入账"
    width="520px"
    destroy-on-close
    :close-on-click-modal="false"
  >
    <el-form label-width="96px" label-position="right" @submit.prevent="handleSubmit">
      <el-form-item label="目标账户">
        <el-input :model-value="targetLabel" disabled />
      </el-form-item>

      <el-form-item label="入账金额" required>
        <el-input-number
          v-model="amount"
          :min="0.01"
          :precision="2"
          :step="10"
          controls-position="right"
          style="width: 100%"
        />
      </el-form-item>

      <el-form-item label="入账来源" required>
        <el-select v-model="source" style="width: 100%">
          <el-option
            v-for="s in internalSources"
            :key="s"
            :label="RechargeProviderLabel[s]"
            :value="s"
          />
        </el-select>
      </el-form-item>

      <el-form-item v-if="showProductSelect" label="入账业务">
        <el-select
          v-model="productCode"
          style="width: 100%"
          clearable
          filterable
          :loading="productsLoading"
          placeholder="选择业务后按该业务返利率触发邀请返利（不选则不返利）"
        >
          <el-option
            v-for="p in products"
            :key="p.code"
            :label="`${p.displayName}（${p.code}）`"
            :value="p.code"
          />
        </el-select>
        <div class="manual-recharge__hint">
          人工充值可触发邀请返利，返利倍率取决于所选业务；不选业务则本次入账不返利。
        </div>
      </el-form-item>

      <el-form-item label="备注">
        <el-input
          v-model="note"
          type="textarea"
          :rows="3"
          maxlength="200"
          show-word-limit
          placeholder="可选，如审批单说明"
        />
      </el-form-item>

      <el-form-item label="幂等键">
        <el-input
          v-model="idempotencyKey"
          maxlength="64"
          placeholder="可选，重复提交时防重复入账"
        />
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="dialogVisible = false">取消</el-button>
      <el-button type="primary" :loading="submitting" @click="handleSubmit">确认入账</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.manual-recharge__hint {
  margin-top: 4px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--el-text-color-secondary);
}
</style>
