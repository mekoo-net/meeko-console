<script setup lang="ts">
/**
 * 市场 › 订单：一单就是一份权益，角色卡和世界卡一样买。买家付人民币进平台钱包；卖家所得也是钱（C2C），冻结期满转可提现。
 * 列表只给订单状态（待付款 / 已扣款 / 待结算 / 已完成 / 失败），钱怎么分、账单号、结算在行首「详情」的抽屉里，同平台账单流水。
 * 列序照平台「账单流水」：订单号 → 买家 → 商品 → 来源 → 状态 → 价格 → 卖家 → 时间。订单号按天按序发，新的在前。
 * 创作者第一次发布时自己得的那一单（0 元）也在这里。
 */
import { onMounted, ref } from 'vue';
import { Search, View } from '@element-plus/icons-vue';

import PageHeader from '@/shared/ui/PageHeader.vue';
import StatusTag from '@/shared/ui/StatusTag.vue';
import EmptyState from '@/shared/ui/EmptyState.vue';
import FilterBar from '@/shared/ui/FilterBar.vue';
import FillListPageLayout from '@/shared/ui/FillListPageLayout.vue';
import { fail } from '@/shared/api/httpTypes';
import { formatDateTime } from '@/shared/lib/date';
import { dateRangeToEpochMillis } from '@/shared/lib/epoch';

import AccountCell from '../../components/content/AccountCell.vue';
import MarketOrderDrawer from '../../components/market/MarketOrderDrawer.vue';
import { usePagedList } from '../../composables/usePagedList';
import {
  MarketItemKindLabel,
  MarketItemKindTagType,
  MarketOrderStageLabel,
  MarketOrderStageTone,
  marketItemKindSchema,
  marketOrderStageSchema,
  type MarketItemKind,
  type MarketOrderRow,
  type MarketOrderStage,
} from '../../model/market.types';
import { formatPrice, MarketItemPage } from '../../model/marketFormat';
import { parseAccountUid } from '../../model/meteringFormat';
import { getTavernMarketPort } from '../../services';

const port = getTavernMarketPort();

/** 同调用日志页：账户（这里是买家）一行、业务条件一行、时间一行。下单时间默认不限。 */
const blank = () => ({
  buyerUid: '',
  sellerUid: '',
  serialNo: '',
  itemId: '',
  kind: undefined as MarketItemKind | undefined,
  stage: undefined as MarketOrderStage | undefined,
  dateRange: null as [string, string] | null,
});
const filter = ref(blank());

const { items, total, page, pageSize, loading, load, reload } = usePagedList<MarketOrderRow>((p) => {
  const f = filter.value;
  const buyer = parseAccountUid(f.buyerUid);
  const seller = parseAccountUid(f.sellerUid);
  return buyer.ok && seller.ok
    ? port.orders(
        {
          buyerUid: buyer.value,
          sellerUid: seller.value,
          serialNo: f.serialNo.trim() || undefined,
          itemId: f.itemId.trim() || undefined,
          kind: f.kind,
          stage: f.stage,
          ...dateRangeToEpochMillis(f.dateRange),
        },
        p,
      )
    : Promise.resolve(fail({ code: 'validation', message: 'UID 只能是数字' }));
}, filter);

const detailOpen = ref(false);
const detailId = ref<string | null>(null);

function openDetail(orderId: string): void {
  detailId.value = orderId;
  detailOpen.value = true;
}

onMounted(() => void load());
</script>

<template>
  <FillListPageLayout>
    <template #header>
      <PageHeader title="订单" />
    </template>

    <template #filters>
      <FilterBar
        v-model:account-uid="filter.buyerUid"
        v-model:date-range="filter.dateRange"
        account-uid-label="买家 UID"
        date-range-label="下单时间"
        :loading="loading"
        @refresh="reload"
        @reset="filter = blank()"
      >
        <el-form-item label="订单号">
          <el-input
            v-model="filter.serialNo"
            :prefix-icon="Search"
            placeholder="精确匹配"
            clearable
            style="width: 220px"
          />
        </el-form-item>
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
        <el-form-item label="状态">
          <el-select
            v-model="filter.stage"
            placeholder="全部"
            clearable
            style="width: 140px"
          >
            <el-option
              v-for="s in marketOrderStageSchema.options"
              :key="s"
              :label="MarketOrderStageLabel[s]"
              :value="s"
            />
          </el-select>
        </el-form-item>

        <template #extra-row>
          <el-form-item label="卖家 UID">
            <el-input
              v-model="filter.sellerUid"
              :prefix-icon="Search"
              placeholder="精确匹配"
              clearable
            />
          </el-form-item>
          <el-form-item label="商品 ID">
            <el-input
              v-model="filter.itemId"
              :prefix-icon="Search"
              placeholder="精确匹配"
              clearable
              style="width: 300px"
            />
          </el-form-item>
        </template>
      </FilterBar>
    </template>

    <el-table
      v-loading="loading"
      :data="items"
      row-key="id"
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
        <template #default="{ row }: { row: MarketOrderRow }">
          <el-button
            :icon="View"
            link
            type="primary"
            title="查看详情"
            @click="openDetail(row.id)"
          />
        </template>
      </el-table-column>

      <el-table-column
        label="订单号"
        min-width="170"
      >
        <template #default="{ row }: { row: MarketOrderRow }">
          <span class="cell-uid">{{ row.serialNo }}</span>
        </template>
      </el-table-column>

      <el-table-column
        label="买家"
        min-width="150"
      >
        <template #default="{ row }: { row: MarketOrderRow }">
          <AccountCell :account="row.buyer" />
        </template>
      </el-table-column>

      <el-table-column
        label="商品"
        min-width="170"
      >
        <template #default="{ row }: { row: MarketOrderRow }">
          <span class="cell-item">
            <el-tag
              size="small"
              effect="plain"
              :type="MarketItemKindTagType[row.item.kind]"
            >
              {{ MarketItemKindLabel[row.item.kind] }}
            </el-tag>
            <router-link
              :to="{ name: MarketItemPage[row.item.kind], query: { itemId: row.item.id } }"
              class="link"
            >
              {{ row.item.name }}
            </router-link>
          </span>
        </template>
      </el-table-column>

      <el-table-column
        label="状态"
        width="84"
      >
        <template #default="{ row }: { row: MarketOrderRow }">
          <StatusTag
            :label="MarketOrderStageLabel[row.stage]"
            :tone="MarketOrderStageTone[row.stage]"
          />
        </template>
      </el-table-column>

      <el-table-column
        label="价格"
        width="84"
        align="right"
      >
        <template #default="{ row }: { row: MarketOrderRow }">
          <span class="num">{{ formatPrice(row.price) }}</span>
        </template>
      </el-table-column>

      <el-table-column
        label="卖家"
        min-width="150"
      >
        <template #default="{ row }: { row: MarketOrderRow }">
          <AccountCell :account="row.seller" />
        </template>
      </el-table-column>

      <el-table-column
        label="下单时间"
        width="150"
      >
        <template #default="{ row }: { row: MarketOrderRow }">
          <span class="cell-date">{{ formatDateTime(row.createdAt) }}</span>
        </template>
      </el-table-column>

      <template #empty>
        <EmptyState
          title="没有符合条件的订单"
          description="调整筛选条件或重置后重试。"
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
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.num {
  font-variant-numeric: tabular-nums;
}

.link {
  color: var(--el-color-primary);
  text-decoration: none;
}
</style>
