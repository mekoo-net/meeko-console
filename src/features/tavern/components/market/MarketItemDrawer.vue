<script setup lang="ts">
/**
 * 商品详情，版式同角色卡抽屉：摘要表在上，门面、在卖的内容分段往下（都按条目，点开看正文），下架 / 恢复放底栏。
 * 内容按类别分：角色卡是预设和描写；世界卡是一整套世界模板（时间、叙事、世界书、规则书）。
 * 底栏是处置，按状态给：在售可下架；已下架可上架、删除；已删除可恢复（同列表行上的「⋯」，都走 useItemModeration）。
 * 评价和订单在列表行上的「操作」里另开弹窗看。
 * 只给在卖的那一版——员工判断要不要下架看的就是它；版本是创作者和买家之间的事，这里不露。
 */
import { computed, ref, watch, type Component } from 'vue';
import { ElMessage } from 'element-plus';

import StatusTag from '@/shared/ui/StatusTag.vue';
import { formatDateTime } from '@/shared/lib/date';

import { accountName, initialOf } from '../../model/contentFormat';
import {
  MarketItemKindLabel,
  MarketItemKindTagType,
  MarketItemStateLabel,
  MarketItemStateTone,
  type MarketItemContent,
  type MarketItemDetail,
  type MarketItemKind,
} from '../../model/market.types';
import { formatPrice } from '../../model/marketFormat';
import { getTavernMarketPort } from '../../services';
import { useItemModeration } from '../../composables/useItemModeration';
import CopyableId from '../metering/CopyableId.vue';
import CharacterCardContent from './CharacterCardContent.vue';
import WorldTemplateContent from './WorldTemplateContent.vue';

const visible = defineModel<boolean>('visible', { required: true });
const props = defineProps<{ itemId: string | null }>();
const emit = defineEmits<{ changed: [itemId: string] }>();

const port = getTavernMarketPort();

const detail = ref<MarketItemDetail | null>(null);
const loading = ref(false);

const item = computed(() => detail.value?.item ?? null);
const onSale = computed(() => detail.value?.onSale ?? null);
const kindLabel = computed(() => (item.value ? MarketItemKindLabel[item.value.listing.kind] : '商品'));

/** 在卖的内容按类别换组件；世界卡内容多，抽屉宽一些。 */
const ContentPane: Readonly<Record<MarketItemKind, Component>> = {
  character_card: CharacterCardContent,
  world_card: WorldTemplateContent,
};
const DrawerSize: Readonly<Record<MarketItemKind, string>> = { character_card: '600px', world_card: '720px' };

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

const { acting, actions } = useItemModeration((row) => {
  emit('changed', row.itemId);
  void load(row.itemId);
});

/** 门面上的几行，两类卡一样。 */
function faceLines(content: MarketItemContent): { label: string; value: string }[] {
  return [
    { label: '简介', value: content.face.tagline ?? '' },
    { label: '介绍', value: content.face.description ?? '' },
    { label: '标签', value: content.face.tags.join('、') },
  ].filter((l) => l.value);
}
</script>

<template>
  <el-drawer
    v-model="visible"
    direction="rtl"
    :size="item ? DrawerSize[item.listing.kind] : DrawerSize.character_card"
  >
    <template #header>
      <div class="drawer-title">
        <el-avatar
          :size="28"
          shape="square"
          :src="item?.listing.image ?? undefined"
          class="drawer-title__avatar"
        >
          {{ initialOf(item?.listing.face.name ?? '') }}
        </el-avatar>
        <span class="drawer-title__text">{{ item?.listing.face.name ?? '商品' }}</span>
        <el-tag
          v-if="item"
          size="small"
          effect="plain"
          :type="MarketItemKindTagType[item.listing.kind]"
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
            {{ formatDateTime(item.publishedAt, 'YYYY-MM-DD HH:mm') }}
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

        <component
          :is="ContentPane[onSale.kind]"
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
          v-for="action in actions[item.state]"
          :key="action.key"
          :type="action.danger ? 'danger' : 'primary'"
          :plain="action.danger"
          :loading="acting === item.itemId"
          @click="action.run(item)"
        >
          {{ action.label }}
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

/* 按钮按列表「⋯」里的顺序给，主操作排最右。 */
.drawer-footer {
  display: flex;
  flex-direction: row-reverse;
  justify-content: flex-start;
}
</style>
