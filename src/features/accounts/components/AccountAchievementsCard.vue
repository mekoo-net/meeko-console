<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';

import { confirmDanger } from '@/shared/composables/useConfirm';
import { formatDateTime } from '@/shared/lib/date';

import type { Account, Achievement } from '../model/account.types';
import { ACHIEVEMENT_CATALOG, type AchievementDef } from '../model/achievementCatalog';
import { getAccountAdminPort } from '../services';
import BadgeMedal from './BadgeMedal.vue';

const props = defineProps<{ account: Account }>();
const emit = defineEmits<{ (e: 'changed'): void }>();

const port = getAccountAdminPort();

const owned = computed<Achievement[]>(() => props.account.achievements ?? []);

/** 按授予日期降序：新拿到的勋章排在最前。 */
const sortedOwned = computed<Achievement[]>(() =>
  [...owned.value].sort((a, b) => (a.grantedAtUtc < b.grantedAtUtc ? 1 : -1)),
);

const ownedCodes = computed(() => new Set(owned.value.map((a) => a.code)));
const grantableDefs = computed<AchievementDef[]>(() =>
  ACHIEVEMENT_CATALOG.filter((d) => !ownedCodes.value.has(d.code)),
);

const page = ref(1);
const pageSize = ref(8);

const pagedOwned = computed<Achievement[]>(() => {
  const start = (page.value - 1) * pageSize.value;
  return sortedOwned.value.slice(start, start + pageSize.value);
});

watch(
  () => sortedOwned.value.length,
  (len) => {
    const maxPage = Math.max(1, Math.ceil(len / pageSize.value));
    if (page.value > maxPage) page.value = maxPage;
  },
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

async function revoke(a: Achievement): Promise<void> {
  const ok = await confirmDanger({
    title: '撤销勋章',
    message: `确认撤销勋章「${a.name}」吗？撤销后该勋章会从账户记录中移除。`,
    confirmText: '撤销',
    type: 'warning',
  });
  if (!ok) return;
  const r = await port.revokeAchievement(props.account.uid, a.code);
  if (r.success) {
    ElMessage.success('勋章已撤销');
    emit('changed');
  } else {
    ElMessage.error(r.error.message);
  }
}
</script>

<template>
  <section class="ach-section">
    <header class="ach-section__head">
      <div class="ach-section__title-row">
        <span class="ach-section__title">成就勋章</span>
        <el-tag v-if="owned.length > 0" type="info" effect="plain" round size="small">
          {{ owned.length }} / {{ ACHIEVEMENT_CATALOG.length }}
        </el-tag>
      </div>
      <el-button
        size="small"
        type="primary"
        :disabled="grantableDefs.length === 0"
        @click="openGrantDialog"
      >
        授予勋章
      </el-button>
    </header>

    <div v-if="owned.length > 0">
      <div class="ach-section__grid">
        <article
          v-for="a in pagedOwned"
          :key="a.code"
          class="ach-card"
          @click="revoke(a)"
        >
          <div class="ach-card__medal">
            <BadgeMedal
              :code="a.code"
              :icon="a.icon"
              :image="a.image"
              :size="96"
            />
          </div>
          <div class="ach-card__body">
            <div class="ach-card__name">{{ a.name }}</div>
            <div class="ach-card__desc">{{ a.description }}</div>
            <div class="ach-card__date">授予于 {{ formatDateTime(a.grantedAtUtc) }}</div>
          </div>
        </article>
      </div>

      <div v-if="owned.length > pageSize" class="ach-section__pagination">
        <el-pagination
          v-model:current-page="page"
          :page-size="pageSize"
          :total="owned.length"
          layout="prev, pager, next, total"
          background
          small
        />
      </div>
    </div>

    <div v-else class="ach-section__empty">尚未获得任何勋章</div>

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
  </section>
</template>

<style scoped>
.ach-section {
  background: #fff;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 12px;
  padding: 18px 22px 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.ach-section__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.ach-section__title-row {
  display: flex;
  align-items: center;
  gap: 10px;
}
.ach-section__title {
  font-size: 15px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}
.ach-section__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 14px;
}
.ach-card {
  background: linear-gradient(180deg, #fafafa 0%, #ffffff 50%, #f8fafc 100%);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 12px;
  padding: 14px 12px 12px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  transition:
    transform 0.18s ease,
    box-shadow 0.18s ease,
    border-color 0.18s ease;
}
.ach-card:hover {
  transform: translateY(-2px);
  border-color: var(--el-color-primary-light-5);
  box-shadow: 0 6px 18px rgba(15, 23, 42, 0.08);
}
.ach-card__medal {
  width: 96px;
  height: 96px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.ach-card__body {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  text-align: center;
}
.ach-card__name {
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}
.ach-card__desc {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  line-height: 1.5;
}
.ach-card__date {
  font-size: 11.5px;
  color: var(--el-text-color-placeholder);
  margin-top: 2px;
}
.ach-section__pagination {
  display: flex;
  justify-content: center;
  margin-top: 4px;
}
.ach-section__empty {
  font-size: 13px;
  color: var(--el-text-color-placeholder);
  padding: 24px 0;
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
