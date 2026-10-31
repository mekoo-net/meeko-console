<script setup lang="ts">
/**
 * 商品详情，版式同角色卡抽屉：摘要表在上，门面、在卖的内容分段往下（都按条目，点开看正文），下架 / 恢复放底栏。
 * 内容按类别分：角色卡是预设和描写；世界书是一整套世界模板（时间、叙事、世界书、规则书）。
 * 评价和订单在列表行上的「操作」里另开弹窗看。
 * 只给在卖的那一版——员工判断要不要下架看的就是它；版本是创作者和买家之间的事，这里不露。
 */
import { computed, ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';

import StatusTag from '@/shared/ui/StatusTag.vue';
import { confirmDanger } from '@/shared/composables/useConfirm';
import { formatDateTime } from '@/shared/lib/date';

import { accountName, initialOf } from '../../model/contentFormat';
import {
  MarketItemKindLabel,
  MarketItemStateLabel,
  MarketItemStateTone,
  type MarketItemContent,
  type MarketItemDetail,
} from '../../model/market.types';
import { formatPrice } from '../../model/marketFormat';
import { presetItems, worldBookItems } from '../../model/promptEntries';
import { getTavernMarketPort } from '../../services';
import PromptEntryList from '../content/PromptEntryList.vue';
import CopyableId from '../metering/CopyableId.vue';
import WorldTemplateContent from './WorldTemplateContent.vue';

const visible = defineModel<boolean>('visible', { required: true });
const props = defineProps<{ itemId: string | null }>();
const emit = defineEmits<{ changed: [itemId: string] }>();

const port = getTavernMarketPort();

const detail = ref<MarketItemDetail | null>(null);
const loading = ref(false);
const acting = ref(false);

const item = computed(() => detail.value?.item ?? null);
const onSale = computed(() => detail.value?.onSale ?? null);
const kindLabel = computed(() => (item.value ? MarketItemKindLabel[item.value.listing.kind] : '商品'));
/** 角色卡露头像，世界书露封面。 */
const image = computed(() => {
  const l = item.value?.listing;
  return (l?.kind === 'character_card' ? l.character.avatar : l?.face.cover) ?? undefined;
});
const presets = computed(() => (onSale.value?.kind === 'character_card' ? presetItems(onSale.value.preset) : []));
const descriptions = computed(() => (onSale.value?.kind === 'character_card' ? worldBookItems(onSale.value.worldBook) : []));

async function load(id: string): Promise<void> {
  loading.value = true;
  try {
    const r = await port.item(id);
    if (id !== props.itemId) return;
    if (r.success) detail.value = r.data;
    else ElMessage.error(r.error.message);
  } finally {
    loading.value = false;
  }
}

watch(
  () => [visible.value, props.itemId] as const,
  ([open, id]) => {
    if (!open || id == null) return;
    if (detail.value?.item.itemId !== id) detail.value = null;
    void load(id);
  },
  { immediate: true },
);

async function takeDown(): Promise<void> {
  const i = item.value;
  if (!i) return;
  const reason = await ElMessageBox.prompt(
    `下架「${i.listing.face.name}」：市场里看不到、不能再买，已买的照常用。`,
    `下架${kindLabel.value}`,
    {
      confirmButtonText: '下架',
      cancelButtonText: '取消',
      inputPlaceholder: '下架原因（创作者看得到）',
      inputValidator: (v) => (v?.trim() ? (v.trim().length <= 200 ? true : '最长 200 字') : '写一下为什么下架'),
      type: 'warning',
    },
  ).then(({ value }) => value.trim(), () => null);
  if (reason == null) return;
  await act(() => port.takeDown(i.itemId, reason), '已下架');
}

async function restore(): Promise<void> {
  const i = item.value;
  if (!i || !(await confirmDanger({ title: '恢复上架', message: `让「${i.listing.face.name}」重新在市场里出售？`, confirmText: '恢复', type: 'info' })))
    return;
  await act(() => port.restore(i.itemId), '已恢复上架');
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
    emit('changed', r.data.itemId);
    await load(r.data.itemId);
  } finally {
    acting.value = false;
  }
}

/** 门面上的几行；角色卡多一行开场白。 */
function faceLines(content: MarketItemContent): { label: string; value: string }[] {
  return [
    { label: '简介', value: content.face.tagline ?? '' },
    { label: '介绍', value: content.face.description ?? '' },
    { label: '标签', value: content.face.tags.join('、') },
    { label: '开场白', value: content.kind === 'character_card' ? content.character.greetings.join('\n\n') : '' },
  ].filter((l) => l.value);
}
</script>

<template>
  <el-drawer
    v-model="visible"
    direction="rtl"
    :size="onSale?.kind === 'world_book' ? '720px' : '600px'"
  >
    <template #header>
      <div class="drawer-title">
        <el-avatar
          :size="28"
          shape="square"
          :src="image"
          class="drawer-title__avatar"
        >
          {{ initialOf(item?.listing.face.name ?? '') }}
        </el-avatar>
        <span class="drawer-title__text">{{ item?.listing.face.name ?? '商品' }}</span>
        <el-tag
          v-if="item"
          size="small"
          effect="plain"
        >
          {{ kindLabel }}
        </el-tag>
        <StatusTag
          v-if="item"
          :label="MarketItemStateLabel[item.state]"
          :tone="MarketItemStateTone[item.state]"
        />
      </div>
    </template>

    <div
      v-loading="loading && !detail"
      class="item-detail"
    >
      <template v-if="item && onSale">
        <el-descriptions
          :column="2"
          border
          size="small"
          class="item-detail__summary"
        >
          <el-descriptions-item
            :label="`${kindLabel} ID`"
            :span="2"
          >
            <CopyableId
              :value="item.itemId"
              :label="`${kindLabel} ID`"
            />
          </el-descriptions-item>
          <el-descriptions-item label="创作者">
            <router-link
              :to="{ name: 'tavern-user', params: { uid: String(item.creator.uid) } }"
              class="link"
            >
              {{ accountName(item.creator) }}
            </router-link>
          </el-descriptions-item>
          <el-descriptions-item label="价格">
            {{ formatPrice(item.price) }}
          </el-descriptions-item>
          <el-descriptions-item
            label="销量 / 评分"
            :span="2"
          >
            {{ item.stats.purchases }} / {{ item.stats.ratingCount ? `${item.stats.rating.toFixed(1)}（${item.stats.ratingCount}）` : '—' }}
          </el-descriptions-item>
          <el-descriptions-item label="首次发布">
            {{ item.publishedAt != null ? formatDateTime(item.publishedAt, 'YYYY-MM-DD HH:mm') : '—' }}
          </el-descriptions-item>
          <el-descriptions-item label="更新时间">
            {{ formatDateTime(item.updatedAt, 'YYYY-MM-DD HH:mm') }}
          </el-descriptions-item>
          <el-descriptions-item
            v-if="item.takedown"
            label="下架原因"
            :span="2"
          >
            {{ item.takedown.reason }}
            <span class="sub">员工 {{ item.takedown.staffUid }} · {{ formatDateTime(item.takedown.atUtc, 'YYYY-MM-DD HH:mm') }}</span>
          </el-descriptions-item>
        </el-descriptions>

        <el-divider />

        <dl class="face">
          <template
            v-for="line in faceLines(onSale)"
            :key="line.label"
          >
            <dt>{{ line.label }}</dt>
            <dd>{{ line.value }}</dd>
          </template>
        </dl>

        <el-divider />

        <template v-if="onSale.kind === 'character_card'">
          <h4 class="section-title">
            预设
          </h4>
          <PromptEntryList
            :entries="presets"
            empty="没写预设"
          />

          <h4 class="section-title section-title--gap">
            描写
          </h4>
          <PromptEntryList
            :entries="descriptions"
            empty="没有描写"
          />
        </template>
        <WorldTemplateContent
          v-else
          :content="onSale"
        />
      </template>
    </div>

    <template #footer>
      <div
        v-if="item"
        class="drawer-footer"
      >
        <el-button
          v-if="item.state === 'listed'"
          type="danger"
          :loading="acting"
          @click="takeDown"
        >
          下架
        </el-button>
        <el-button
          v-else-if="item.state === 'taken_down'"
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

.item-detail {
  min-height: 120px;
  font-size: 13px;
  line-height: 1.6;
}

.item-detail__summary :deep(.el-descriptions__label) {
  width: 88px;
}

.section-title {
  margin: 6px 0 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-regular);
}

.section-title--gap {
  margin-top: 16px;
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

.drawer-footer {
  display: flex;
  justify-content: flex-end;
}
</style>
