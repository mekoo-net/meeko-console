<script setup lang="ts">
/**
 * 商品行上「评价」「订单」弹窗的共用外壳。尺寸照 Yomi「接入供应商」大弹窗（`min(1200px, 96vw)`、离顶 4vh、内容区定高），
 * 不随条数缩成一条：头部是这件商品（图、名字、类别、状态、创作者），下面一排统计，
 * 再下面一行可选的轻筛选，表格（compact-table，`height="100%"`）铺满剩下的高度，分页贴底。
 */
import StatusTag from '@/shared/ui/StatusTag.vue';
import { formatDateTime } from '@/shared/lib/date';

import { accountName, initialOf } from '../../model/contentFormat';
import { MarketItemKindLabel, MarketItemKindTagType, MarketItemStateLabel, MarketItemStateTone, type MarketItemRow } from '../../model/market.types';
import type { RecordStat } from '../../model/marketFormat';

const visible = defineModel<boolean>('visible', { required: true });
const page = defineModel<number>('page', { required: true });
const pageSize = defineModel<number>('pageSize', { required: true });
defineProps<{ title: string; item: MarketItemRow | null; stats: RecordStat[]; total: number }>();
</script>

<template>
  <el-dialog
    v-model="visible"
    width="min(1200px, 96vw)"
    top="4vh"
    class="records-dialog"
    destroy-on-close
    append-to-body
  >
    <template #header>
      <div
        v-if="item"
        class="records-head"
      >
        <el-avatar
          :size="44"
          shape="square"
          :src="item.listing.image ?? undefined"
          class="records-head__avatar"
        >
          {{ initialOf(item.listing.face.name) }}
        </el-avatar>
        <div class="records-head__info">
          <div class="records-head__title">
            <span>{{ title }}</span>
            <span class="records-head__dot">·</span>
            <span class="records-head__name">{{ item.listing.face.name }}</span>
            <el-tag
              size="small"
              effect="plain"
              :type="MarketItemKindTagType[item.listing.kind]"
            >
              {{ MarketItemKindLabel[item.listing.kind] }}
            </el-tag>
            <StatusTag
              :label="MarketItemStateLabel[item.state]"
              :tone="MarketItemStateTone[item.state]"
            />
          </div>
          <div class="records-head__meta">
            <span class="meta">
              创作者
              <router-link
                :to="{ name: 'tavern-user', params: { uid: String(item.creator.uid) } }"
                class="link"
              >{{ accountName(item.creator) }}</router-link>
            </span>
            <span class="meta">首次发布 {{ formatDateTime(item.publishedAt, 'YYYY-MM-DD') }}</span>
          </div>
        </div>
      </div>
    </template>

    <div class="records-body">
      <dl
        class="records-stats"
        :style="{ gridTemplateColumns: `repeat(${stats.length}, minmax(0, 1fr))` }"
      >
        <div
          v-for="s in stats"
          :key="s.label"
          class="stat"
        >
          <dt>{{ s.label }}</dt>
          <dd>
            {{ s.value }}
            <el-rate
              v-if="s.rating != null"
              :model-value="s.rating"
              disabled
              allow-half
              size="small"
              class="stat__rate"
            />
          </dd>
        </div>
      </dl>

      <div
        v-if="$slots.toolbar"
        class="records-toolbar"
      >
        <slot name="toolbar" />
      </div>

      <div class="records-table">
        <slot />
      </div>

      <div class="records-pager">
        <el-pagination
          v-model:current-page="page"
          v-model:page-size="pageSize"
          :total="total"
          :page-sizes="[20, 50, 100]"
          layout="total, sizes, prev, pager, next"
          background
        />
      </div>
    </div>
  </el-dialog>
</template>

<style scoped>
.records-head {
  display: flex;
  align-items: center;
  gap: 14px;
  min-width: 0;
}

.records-head__avatar {
  flex-shrink: 0;
  font-size: 18px;
  font-weight: 600;
  color: #fff;
  background: var(--el-color-primary);
  border-radius: 8px;
}

.records-head__info {
  min-width: 0;
}

.records-head__title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 18px;
  font-weight: 600;
  line-height: 26px;
  color: var(--el-text-color-primary);
}

.records-head__dot {
  color: var(--el-text-color-placeholder);
}

.records-head__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.records-head__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  margin-top: 4px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.meta {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.meta + .meta::before {
  content: '';
  width: 1px;
  height: 12px;
  margin: 0 12px;
  background: var(--el-border-color);
}

.link {
  color: var(--el-color-primary);
  text-decoration: none;
}

/* 内容区定高：条数少不缩成一条，条数多表格自己滚。 */
.records-body {
  display: flex;
  flex-direction: column;
  height: min(70vh, 680px);
  min-height: 440px;
}

.records-stats {
  flex-shrink: 0;
  display: grid;
  margin: 0 0 16px;
  padding: 14px 0;
  border-top: 1px solid var(--el-border-color-extra-light);
  border-bottom: 1px solid var(--el-border-color-extra-light);
}

.stat {
  padding: 0 24px;
}

.stat:first-child {
  padding-left: 0;
}

.stat + .stat {
  border-left: 1px solid var(--el-border-color-lighter);
}

.stat dt {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.stat dd {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 4px 0 0;
  font-size: 22px;
  font-weight: 600;
  line-height: 30px;
  color: var(--el-text-color-primary);
  font-variant-numeric: tabular-nums;
}

.stat__rate {
  height: 20px;
}

.records-toolbar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}

.records-table {
  flex: 1;
  min-height: 0;
}

.records-pager {
  flex-shrink: 0;
  display: flex;
  justify-content: flex-end;
  padding-top: 14px;
}
</style>

<style>
/* 弹窗挂在 body 上，scoped 够不着它自己的头和身子。 */
.records-dialog .el-dialog__header {
  padding-bottom: 16px;
}

.records-dialog .el-dialog__body {
  padding-top: 4px;
}
</style>
