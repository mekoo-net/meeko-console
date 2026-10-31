<script setup lang="ts">
/**
 * 市场卡详情，版式同角色卡抽屉：摘要表在上，卡面、版本历史、未发布的改动、最近评价分段往下，下架 / 恢复放底栏。
 * 每个版本的人设和世界书原样给——员工判断要不要下架，看的就是这些。
 */
import { computed, ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';

import StatusTag from '@/shared/ui/StatusTag.vue';
import { confirmDanger } from '@/shared/composables/useConfirm';
import { formatDateTime } from '@/shared/lib/date';

import { accountName, initialOf } from '../../model/contentFormat';
import { MarketCardStateLabel, MarketCardStateTone, type CardFace, type MarketCardDetail } from '../../model/market.types';
import { formatPrice } from '../../model/marketFormat';
import { getTavernMarketPort } from '../../services';
import ImportedCardContent from '../content/ImportedCardContent.vue';
import CopyableId from '../metering/CopyableId.vue';

const visible = defineModel<boolean>('visible', { required: true });
const props = defineProps<{ cardId: string | null }>();
const emit = defineEmits<{ changed: [cardId: string] }>();

const port = getTavernMarketPort();

const detail = ref<MarketCardDetail | null>(null);
const loading = ref(false);
const acting = ref(false);
/** 展开的版本：默认只开最新一版。 */
const openVersions = ref<number[]>([]);

const card = computed(() => detail.value?.card ?? null);

async function load(id: string): Promise<void> {
  loading.value = true;
  try {
    const r = await port.card(id);
    if (id !== props.cardId) return;
    if (r.success) {
      detail.value = r.data;
      openVersions.value = r.data.versions.slice(0, 1).map((v) => v.version);
    } else {
      ElMessage.error(r.error.message);
    }
  } finally {
    loading.value = false;
  }
}

watch(
  () => [visible.value, props.cardId] as const,
  ([open, id]) => {
    if (!open || id == null) return;
    if (detail.value?.card.cardId !== id) detail.value = null;
    void load(id);
  },
  { immediate: true },
);

async function takeDown(): Promise<void> {
  const c = card.value;
  if (!c) return;
  const reason = await ElMessageBox.prompt(`下架「${c.face.name}」：市场里看不到、不能再买，已买的照常用手里的版本。`, '下架', {
    confirmButtonText: '下架',
    cancelButtonText: '取消',
    inputPlaceholder: '下架原因（创作者看得到）',
    inputValidator: (v) => (v?.trim() ? (v.trim().length <= 200 ? true : '最长 200 字') : '写一下为什么下架'),
    type: 'warning',
  }).then(({ value }) => value.trim(), () => null);
  if (reason == null) return;
  await act(() => port.takeDown(c.cardId, reason), '已下架');
}

async function restore(): Promise<void> {
  const c = card.value;
  if (!c || !(await confirmDanger({ title: '恢复上架', message: `让「${c.face.name}」重新在市场里出售？`, confirmText: '恢复', type: 'info' })))
    return;
  await act(() => port.restore(c.cardId), '已恢复上架');
}

async function act(run: () => ReturnType<typeof port.restore>, done: string): Promise<void> {
  acting.value = true;
  try {
    const r = await run();
    if (!r.success) {
      ElMessage.error(r.error.message);
      return;
    }
    ElMessage.success(done);
    emit('changed', r.data.cardId);
    await load(r.data.cardId);
  } finally {
    acting.value = false;
  }
}

function faceLines(face: CardFace): { label: string; value: string }[] {
  return [
    { label: '简介', value: face.tagline ?? '' },
    { label: '介绍', value: face.description ?? '' },
    { label: '标签', value: face.tags.join('、') },
    { label: '开场白', value: face.greetings.join('\n\n') },
  ].filter((l) => l.value);
}
</script>

<template>
  <el-drawer
    v-model="visible"
    direction="rtl"
    size="600px"
  >
    <template #header>
      <div class="drawer-title">
        <el-avatar
          :size="28"
          shape="square"
          :src="card?.face.avatar ?? undefined"
          class="drawer-title__avatar"
        >
          {{ initialOf(card?.face.name ?? '') }}
        </el-avatar>
        <span class="drawer-title__text">{{ card?.face.name ?? '市场卡' }}</span>
        <StatusTag
          v-if="card"
          :label="MarketCardStateLabel[card.state]"
          :tone="MarketCardStateTone[card.state]"
        />
      </div>
    </template>

    <div
      v-loading="loading && !detail"
      class="card-detail"
    >
      <template v-if="detail && card">
        <el-descriptions
          :column="2"
          border
          size="small"
          class="card-detail__summary"
        >
          <el-descriptions-item
            label="卡号"
            :span="2"
          >
            <CopyableId
              :value="card.cardId"
              label="卡号"
            />
          </el-descriptions-item>
          <el-descriptions-item label="创作者">
            <router-link
              :to="{ name: 'tavern-user', params: { uid: String(card.creator.uid) } }"
              class="link"
            >
              {{ accountName(card.creator) }}
            </router-link>
          </el-descriptions-item>
          <el-descriptions-item label="价格">
            {{ formatPrice(card.price) }}
          </el-descriptions-item>
          <el-descriptions-item label="版本">
            {{ card.version > 0 ? `v${card.version}` : '未发布' }}
          </el-descriptions-item>
          <el-descriptions-item label="销量 / 评分">
            {{ card.stats.purchases }} / {{ card.stats.ratingCount ? `${card.stats.rating.toFixed(1)}（${card.stats.ratingCount}）` : '—' }}
          </el-descriptions-item>
          <el-descriptions-item label="首次发布">
            {{ card.publishedAt != null ? formatDateTime(card.publishedAt, 'YYYY-MM-DD HH:mm') : '—' }}
          </el-descriptions-item>
          <el-descriptions-item label="更新时间">
            {{ formatDateTime(card.updatedAt, 'YYYY-MM-DD HH:mm') }}
          </el-descriptions-item>
          <el-descriptions-item
            v-if="card.takedown"
            label="下架原因"
            :span="2"
          >
            {{ card.takedown.reason }}
            <span class="sub">员工 {{ card.takedown.staffUid }} · {{ formatDateTime(card.takedown.atUtc, 'YYYY-MM-DD HH:mm') }}</span>
          </el-descriptions-item>
        </el-descriptions>

        <el-divider />

        <h4 class="section-title">
          卡面
        </h4>
        <dl class="face">
          <template
            v-for="line in faceLines(card.face)"
            :key="line.label"
          >
            <dt>{{ line.label }}</dt>
            <dd>{{ line.value }}</dd>
          </template>
        </dl>

        <template v-if="detail.versions.length">
          <el-divider />
          <h4 class="section-title">
            版本历史
          </h4>
          <el-collapse v-model="openVersions">
            <el-collapse-item
              v-for="v in detail.versions"
              :key="v.version"
              :name="v.version"
            >
              <template #title>
                <span class="version-title">
                  <span class="num">v{{ v.version }}</span>
                  <span class="sub">{{ formatPrice({ amount: v.price, currency: card.price.currency }) }} · {{ formatDateTime(v.publishedAt, 'YYYY-MM-DD HH:mm') }}</span>
                </span>
              </template>
              <ImportedCardContent :content="v.content" />
            </el-collapse-item>
          </el-collapse>
        </template>

        <template v-if="detail.draft">
          <el-divider />
          <h4 class="section-title">
            未发布的改动
            <span class="sub">{{ formatPrice({ amount: detail.draft.price, currency: card.price.currency }) }}</span>
          </h4>
          <ImportedCardContent :content="detail.draft.content" />
        </template>

        <el-divider />
        <h4 class="section-title">
          最近评价
        </h4>
        <div
          v-for="r in detail.reviews"
          :key="r.id"
          class="review"
        >
          <div class="review__head">
            <router-link
              :to="{ name: 'tavern-user', params: { uid: String(r.account.uid) } }"
              class="link"
            >
              {{ accountName(r.account) }}
            </router-link>
            <el-rate
              :model-value="r.rating"
              disabled
              size="small"
            />
            <span class="sub">v{{ r.cardVersion }} · {{ formatDateTime(r.updatedAt) }}</span>
          </div>
          <p
            v-if="r.content"
            class="review__text"
          >
            {{ r.content }}
          </p>
        </div>
        <span
          v-if="!detail.reviews.length"
          class="cell-muted"
        >还没有评价</span>
      </template>
    </div>

    <template #footer>
      <div
        v-if="card"
        class="drawer-footer"
      >
        <el-button
          v-if="card.state === 'listed'"
          type="danger"
          :loading="acting"
          @click="takeDown"
        >
          下架
        </el-button>
        <el-button
          v-else-if="card.state === 'taken_down'"
          type="primary"
          :loading="acting"
          @click="restore"
        >
          恢复上架
        </el-button>
      </div>
    </template>
  </el-drawer>
</template>

<style scoped>
.drawer-title {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.drawer-title__avatar {
  flex-shrink: 0;
  font-size: 13px;
  font-weight: 600;
  color: #fff;
  background: var(--el-color-primary);
}

.drawer-title__text {
  overflow: hidden;
  font-size: 16px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.card-detail {
  min-height: 120px;
  font-size: 13px;
  line-height: 1.6;
}

.card-detail__summary :deep(.el-descriptions__label) {
  width: 88px;
}

.section-title {
  margin: 6px 0 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-regular);
}

.face {
  display: grid;
  grid-template-columns: 56px 1fr;
  gap: 6px 12px;
  margin: 0;
}

.face dt {
  color: var(--el-text-color-secondary);
}

.face dd {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--el-text-color-regular);
}

.version-title {
  display: inline-flex;
  align-items: baseline;
  gap: 8px;
}

.review {
  padding: 8px 0;
  border-bottom: 1px solid var(--el-border-color-extra-light);
}

.review__head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.review__text {
  margin: 4px 0 0;
  color: var(--el-text-color-regular);
  white-space: pre-wrap;
}

.num {
  font-variant-numeric: tabular-nums;
}

.sub {
  margin-left: 6px;
  font-size: 12px;
  font-weight: 400;
  color: var(--el-text-color-secondary);
}

.link {
  color: var(--el-color-primary);
  text-decoration: none;
}

.cell-muted {
  color: var(--el-text-color-placeholder);
}

.drawer-footer {
  display: flex;
  justify-content: flex-end;
}
</style>
