<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';

import MoneyText from '@/shared/ui/MoneyText.vue';
import { TIER_THRESHOLDS } from '../model/tierConfig';
import { getAccountAdminPort } from '../services';

const props = defineProps<{
  /** 账户 UID（调整等级时使用）。 */
  uid: string;
  /** 账户当前等级（后端存储，管理员手动维护）。 */
  tier: number;
  /** 账户累积充值金额（元）。 */
  totalRechargedAmount: number;
}>();

const emit = defineEmits<{ changed: [] }>();

const port = getAccountAdminPort();

const selected = ref(props.tier);
const saving = ref(false);

// 外部刷新带来新 tier 时同步本地选择。
watch(
  () => props.tier,
  (value) => {
    selected.value = value;
  },
);

const tierName = computed(
  () => TIER_THRESHOLDS.find((t) => t.level === props.tier)?.name ?? `Lv${props.tier}`,
);
const dirty = computed(() => selected.value !== props.tier);

async function save(): Promise<void> {
  if (!dirty.value) return;
  saving.value = true;
  try {
    const r = await port.setAccountTier(props.uid, selected.value);
    if (r.success) {
      ElMessage.success(`已调整为 Lv${selected.value}`);
      emit('changed');
    } else {
      selected.value = props.tier;
      ElMessage.error(r.error.message);
    }
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div class="tier-card">
    <div class="tier-card__head">
      <span class="tier-card__label">账户等级</span>
      <span class="tier-card__level">Lv{{ tier }}</span>
    </div>
    <div class="tier-card__name">{{ tierName }}</div>

    <div class="tier-card__amount">
      <span class="tier-card__amount-label">累计充值</span>
      <MoneyText
        :value="totalRechargedAmount"
        :options="{ currency: 'CNY' }"
      />
    </div>

    <div class="tier-card__adjust">
      <span class="tier-card__adjust-label">调整等级</span>
      <el-select
        v-model="selected"
        size="small"
        class="tier-card__select"
      >
        <el-option
          v-for="t in TIER_THRESHOLDS"
          :key="t.level"
          :label="`Lv${t.level}`"
          :value="t.level"
        />
      </el-select>
      <el-button
        type="primary"
        size="small"
        :disabled="!dirty"
        :loading="saving"
        @click="save"
      >
        保存
      </el-button>
    </div>
  </div>
</template>

<style scoped>
.tier-card {
  background: linear-gradient(135deg, #f5f3ff, #ede9fe);
  border-radius: 10px;
  padding: 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 152px;
}
.tier-card__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}
.tier-card__label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.tier-card__level {
  font-size: 24px;
  font-weight: 700;
  color: #6d28d9;
  font-variant-numeric: tabular-nums;
}
.tier-card__name {
  font-size: 13px;
  color: var(--el-text-color-primary);
  font-weight: 500;
}
.tier-card__amount {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
  margin-top: 4px;
}
.tier-card__amount-label {
  color: var(--el-text-color-secondary);
}
.tier-card__adjust {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: auto;
}
.tier-card__adjust-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.tier-card__select {
  width: 90px;
}
</style>
