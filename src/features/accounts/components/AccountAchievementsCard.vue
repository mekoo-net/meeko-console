<script setup lang="ts">
import { computed, ref } from 'vue';
import { ElMessage } from 'element-plus';

import { confirmDanger } from '@/shared/composables/useConfirm';
import { formatDateTime } from '@/shared/lib/date';

import type { Account, Achievement } from '../model/account.types';
import { ACHIEVEMENT_CATALOG, type AchievementDef } from '../model/achievementCatalog';
import { getAccountAdminPort } from '../services';

const props = defineProps<{ account: Account }>();
const emit = defineEmits<{ (e: 'changed'): void }>();

const port = getAccountAdminPort();

const owned = computed<Achievement[]>(() => props.account.achievements ?? []);
const ownedCodes = computed(() => new Set(owned.value.map((a) => a.code)));
const grantableDefs = computed<AchievementDef[]>(() =>
  ACHIEVEMENT_CATALOG.filter((d) => !ownedCodes.value.has(d.code)),
);

const dialogOpen = ref(false);
const selectedCode = ref<string>('');
const submitting = ref(false);

function openGrantDialog(): void {
  selectedCode.value = grantableDefs.value[0]?.code ?? '';
  dialogOpen.value = true;
}

async function submitGrant(): Promise<void> {
  if (!selectedCode.value) return;
  submitting.value = true;
  try {
    const r = await port.grantAchievement(props.account.uid, selectedCode.value);
    if (r.success) {
      ElMessage.success('勋章已授予');
      dialogOpen.value = false;
      emit('changed');
    } else {
      ElMessage.error(r.error.message);
    }
  } finally {
    submitting.value = false;
  }
}

async function revoke(code: string, name: string): Promise<void> {
  const ok = await confirmDanger({
    title: '撤销勋章',
    message: `确认撤销勋章「${name}」吗？此操作可逆，撤销后该勋章会从账户记录中移除。`,
    confirmText: '撤销',
    type: 'warning',
  });
  if (!ok) return;
  const r = await port.revokeAchievement(props.account.uid, code);
  if (r.success) {
    ElMessage.success('勋章已撤销');
    emit('changed');
  } else {
    ElMessage.error(r.error.message);
  }
}
</script>

<template>
  <div class="ach-card">
    <div class="ach-card__head">
      <span class="ach-card__label">成就勋章</span>
      <el-button
        size="small"
        type="primary"
        :disabled="grantableDefs.length === 0"
        @click="openGrantDialog"
      >
        授予勋章
      </el-button>
    </div>

    <div v-if="owned.length > 0" class="ach-card__grid">
      <el-tooltip
        v-for="a in owned"
        :key="a.code"
        :content="`${a.description} · 授予于 ${formatDateTime(a.grantedAtUtc)}`"
        placement="top"
      >
        <div class="ach-item" @click="revoke(a.code, a.name)">
          <div class="ach-item__icon">{{ a.icon }}</div>
          <div class="ach-item__name">{{ a.name }}</div>
        </div>
      </el-tooltip>
    </div>
    <div v-else class="ach-card__empty">尚未获得任何勋章</div>

    <el-dialog v-model="dialogOpen" title="授予勋章" width="460px" destroy-on-close>
      <el-form label-width="80px" @submit.prevent>
        <el-form-item label="勋章">
          <el-select v-model="selectedCode" style="width: 100%">
            <el-option
              v-for="d in grantableDefs"
              :key="d.code"
              :label="`${d.icon} ${d.name}`"
              :value="d.code"
            >
              <div class="ach-option">
                <span class="ach-option__icon">{{ d.icon }}</span>
                <div class="ach-option__body">
                  <div class="ach-option__name">{{ d.name }}</div>
                  <div class="ach-option__desc">{{ d.description }}</div>
                </div>
              </div>
            </el-option>
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogOpen = false">取消</el-button>
        <el-button
          type="primary"
          :loading="submitting"
          :disabled="!selectedCode"
          @click="submitGrant"
        >
          授予
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.ach-card {
  background: #fff;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 10px;
  padding: 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 152px;
}
.ach-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.ach-card__label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.ach-card__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(72px, 1fr));
  gap: 10px;
}
.ach-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 8px 6px;
  border-radius: 8px;
  background: #fefce8;
  border: 1px solid #fde68a;
  cursor: pointer;
  transition: transform 0.15s;
}
.ach-item:hover {
  transform: translateY(-1px);
  border-color: #f59e0b;
}
.ach-item__icon {
  font-size: 22px;
  line-height: 1;
}
.ach-item__name {
  font-size: 11px;
  color: var(--el-text-color-regular);
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}
.ach-card__empty {
  font-size: 13px;
  color: var(--el-text-color-placeholder);
  padding: 12px 0;
  text-align: center;
}
.ach-option {
  display: flex;
  align-items: center;
  gap: 10px;
}
.ach-option__icon {
  font-size: 18px;
}
.ach-option__body {
  display: flex;
  flex-direction: column;
  line-height: 1.3;
}
.ach-option__name {
  font-weight: 500;
}
.ach-option__desc {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>
