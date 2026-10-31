<script setup lang="ts">
/**
 * 用户视角 › 市场 › 收益：这个人作为卖家赚的钱（人民币，记在 Tavern 账上）。上面四格余额，下面收益明细，新的在前。
 * 金额不标正负：卖出进待结算，结算从待结算挪到可提现，提现从可提现挪到提现中再到已提现，看「类型」；
 * 每一行写着动完以后待结算、可提现各剩多少，对账从这里看。提现单在旁边「提现」里审。
 */
import { onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';

import EmptyState from '@/shared/ui/EmptyState.vue';
import FillListPageLayout from '@/shared/ui/FillListPageLayout.vue';
import { formatDateTime } from '@/shared/lib/date';

import { usePagedList } from '../../composables/usePagedList';
import { SellerBalanceLabel, SellerTxnKindLabel, type SellerBalance, type SellerTxn } from '../../model/market.types';
import { formatYuan } from '../../model/marketFormat';
import { getTavernMarketPort } from '../../services';

const props = defineProps<{ accountUid: number }>();

const port = getTavernMarketPort();

const balance = ref<SellerBalance | null>(null);
const buckets = ['pending', 'available', 'withdrawing', 'withdrawn'] as const;

const { items, total, page, pageSize, loading, load } = usePagedList<SellerTxn>((p) => port.sellerTxns(props.accountUid, p));

async function loadBalance(): Promise<void> {
  const r = await port.seller(props.accountUid);
  if (r.success) balance.value = r.data.balance;
  else ElMessage.error(r.error.message);
}

onMounted(() => {
  void loadBalance();
  void load();
});
</script>

<template>
  <FillListPageLayout embedded>
    <template #filters>
      <dl class="balance">
        <div
          v-for="b in buckets"
          :key="b"
          class="stat"
        >
          <dt>{{ SellerBalanceLabel[b] }}</dt>
          <dd :class="{ 'stat--accent': b === 'available' }">
            {{ balance ? formatYuan(balance[b]) : '—' }}
          </dd>
        </div>
      </dl>
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
        label="时间"
        width="150"
      >
        <template #default="{ row }: { row: SellerTxn }">
          <span class="cell-date">{{ formatDateTime(row.createdAt) }}</span>
        </template>
      </el-table-column>
      <el-table-column
        label="类型"
        width="100"
      >
        <template #default="{ row }: { row: SellerTxn }">
          {{ SellerTxnKindLabel[row.kind] }}
        </template>
      </el-table-column>
      <el-table-column
        label="金额"
        width="110"
        align="right"
      >
        <template #default="{ row }: { row: SellerTxn }">
          <span class="num">{{ formatYuan(row.amount) }}</span>
        </template>
      </el-table-column>
      <el-table-column
        label="单号"
        min-width="170"
      >
        <template #default="{ row }: { row: SellerTxn }">
          <span class="cell-uid">{{ row.source.ref }}</span>
        </template>
      </el-table-column>
      <el-table-column
        label="待结算"
        width="100"
        align="right"
      >
        <template #default="{ row }: { row: SellerTxn }">
          <span class="num muted">{{ formatYuan(row.balanceAfter.pending) }}</span>
        </template>
      </el-table-column>
      <el-table-column
        label="可提现"
        width="100"
        align="right"
      >
        <template #default="{ row }: { row: SellerTxn }">
          <span class="num">{{ formatYuan(row.balanceAfter.available) }}</span>
        </template>
      </el-table-column>
      <el-table-column
        label="备注"
        min-width="200"
      >
        <template #default="{ row }: { row: SellerTxn }">
          <span
            v-if="row.note"
            class="note"
          >{{ row.note }}</span>
          <span
            v-else
            class="cell-muted"
          >—</span>
        </template>
      </el-table-column>

      <template #empty>
        <EmptyState
          title="暂无收益"
          description="该用户卖出商品后，收益流水显示在这里。"
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
</template>

<style scoped>
.balance {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  width: 100%;
  margin: 0;
  padding: 14px 20px;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
}

.stat {
  padding: 0 20px;
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
  margin: 4px 0 0;
  font-size: 20px;
  font-weight: 600;
  line-height: 28px;
  color: var(--el-text-color-primary);
  font-variant-numeric: tabular-nums;
}

.stat dd.stat--accent {
  color: var(--el-color-primary);
}

.num {
  font-variant-numeric: tabular-nums;
}

.muted {
  color: var(--el-text-color-secondary);
}

.note {
  color: var(--el-text-color-regular);
}
</style>
