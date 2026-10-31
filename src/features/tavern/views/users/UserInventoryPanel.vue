<script setup lang="ts">
/**
 * 用户视角 › 市场 › 仓库：这个人手里有的商品，一件一行，新得的在前——买来的，和自己上架时得的那一份。
 * 商品被下架了照样在仓库里（下架只是停售，已有的照常用），「在售状态」一列标出来。
 * 行首「详情」打开对应的订单（订单抽屉）；商品名点过去是市场里那一件。
 */
import { onMounted, ref } from 'vue';
import { View } from '@element-plus/icons-vue';

import StatusTag from '@/shared/ui/StatusTag.vue';
import EmptyState from '@/shared/ui/EmptyState.vue';
import FilterBar from '@/shared/ui/FilterBar.vue';
import FillListPageLayout from '@/shared/ui/FillListPageLayout.vue';
import { formatDateTime } from '@/shared/lib/date';

import AccountCell from '../../components/content/AccountCell.vue';
import MarketOrderDrawer from '../../components/market/MarketOrderDrawer.vue';
import { usePagedList } from '../../composables/usePagedList';
import { initialOf } from '../../model/contentFormat';
import {
  InventorySourceLabel,
  MarketItemKindLabel,
  MarketItemStateLabel,
  MarketItemStateTone,
  marketItemKindSchema,
  marketOrderSourceSchema,
  type InventoryRow,
  type MarketItemKind,
  type MarketOrderSource,
} from '../../model/market.types';
import { itemPage } from '../../model/marketFormat';
import { getTavernMarketPort } from '../../services';

const props = defineProps<{ accountUid: number }>();

const port = getTavernMarketPort();

const blank = () => ({ kind: undefined as MarketItemKind | undefined, source: undefined as MarketOrderSource | undefined });
const filter = ref(blank());

const { items, total, page, pageSize, loading, load, reload } = usePagedList<InventoryRow>(
  (p) => port.inventory(props.accountUid, { kind: filter.value.kind, source: filter.value.source }, p),
  filter,
);

const detailOpen = ref(false);
const detailId = ref<string | null>(null);

function openDetail(orderId: string): void {
  detailId.value = orderId;
  detailOpen.value = true;
}

onMounted(() => void load());
</script>

<template>
  <FillListPageLayout embedded>
    <template #filters>
      <FilterBar
        :loading="loading"
        @refresh="reload"
        @reset="filter = blank()"
      >
        <el-form-item label="类别">
          <el-select
            v-model="filter.kind"
            placeholder="全部"
            clearable
            style="width: 120px"
          >
            <el-option
              v-for="k in marketItemKindSchema.options"
              :key="k"
              :label="MarketItemKindLabel[k]"
              :value="k"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="获得方式">
          <el-select
            v-model="filter.source"
            placeholder="全部"
            clearable
            style="width: 120px"
          >
            <el-option
              v-for="s in marketOrderSourceSchema.options"
              :key="s"
              :label="InventorySourceLabel[s]"
              :value="s"
            />
          </el-select>
        </el-form-item>
      </FilterBar>
    </template>

    <el-table
      v-loading="loading"
      :data="items"
      row-key="orderId"
      size="small"
      class="compact-table"
      height="100%"
      :empty-text="' '"
    >
      <el-table-column
        label="详情"
        width="56"
        align="center"
        fixed
      >
        <template #default="{ row }: { row: InventoryRow }">
          <el-button
            :icon="View"
            link
            type="primary"
            title="查看订单"
            @click="openDetail(row.orderId)"
          />
        </template>
      </el-table-column>

      <el-table-column
        label="商品"
        min-width="200"
      >
        <template #default="{ row }: { row: InventoryRow }">
          <div class="cell-item">
            <el-avatar
              :size="32"
              shape="square"
              :src="row.image ?? undefined"
              class="cell-item__avatar"
            >
              {{ initialOf(row.item.name) }}
            </el-avatar>
            <router-link
              :to="{ name: itemPage(row.item.kind), query: { itemId: row.item.id } }"
              class="link"
            >
              {{ row.item.name }}
            </router-link>
          </div>
        </template>
      </el-table-column>

      <el-table-column
        label="类别"
        width="90"
      >
        <template #default="{ row }: { row: InventoryRow }">
          <el-tag
            size="small"
            effect="plain"
            :type="row.item.kind === 'world_book' ? 'success' : 'primary'"
          >
            {{ MarketItemKindLabel[row.item.kind] }}
          </el-tag>
        </template>
      </el-table-column>

      <el-table-column
        label="创作者"
        min-width="170"
      >
        <template #default="{ row }: { row: InventoryRow }">
          <AccountCell :account="row.creator" />
        </template>
      </el-table-column>

      <el-table-column
        label="获得方式"
        width="90"
      >
        <template #default="{ row }: { row: InventoryRow }">
          {{ InventorySourceLabel[row.source] }}
        </template>
      </el-table-column>

      <el-table-column
        label="在售状态"
        width="90"
      >
        <template #default="{ row }: { row: InventoryRow }">
          <StatusTag
            :label="MarketItemStateLabel[row.itemState]"
            :tone="MarketItemStateTone[row.itemState]"
          />
        </template>
      </el-table-column>

      <el-table-column
        label="获得时间"
        width="150"
      >
        <template #default="{ row }: { row: InventoryRow }">
          <span class="cell-date">{{ formatDateTime(row.acquiredAt) }}</span>
        </template>
      </el-table-column>

      <template #empty>
        <EmptyState
          title="暂无商品"
          description="该用户尚未购买或创作商品。"
        />
      </template>
    </el-table>

    <template #footer>
      <el-pagination
        v-model:current-page="page"
        v-model:page-size="pageSize"
        :total="total"
        :page-sizes="[20, 50, 100]"
        layout="total, sizes, prev, pager, next"
        background
      />
    </template>
  </FillListPageLayout>

  <MarketOrderDrawer
    v-model:visible="detailOpen"
    :order-id="detailId"
  />
</template>

<style scoped>
.cell-item {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.cell-item__avatar {
  flex-shrink: 0;
  font-size: 14px;
  font-weight: 600;
  color: #fff;
  background: var(--el-color-primary);
}

.link {
  overflow: hidden;
  color: var(--el-color-primary);
  text-decoration: none;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
