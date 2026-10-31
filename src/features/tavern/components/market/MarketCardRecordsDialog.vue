<script setup lang="ts">
/**
 * 商品行「评价」「订单」打开的弹窗：同一个壳，里面按要看的东西换表——评价表，或只看这张卡的订单表。
 */
import { computed, type Component } from 'vue';

import MarketOrdersView from '../../views/market/MarketOrdersView.vue';
import MarketReviewsTable from './MarketReviewsTable.vue';

export type MarketCardRecords = 'reviews' | 'orders';

const visible = defineModel<boolean>('visible', { required: true });
const props = defineProps<{ card: { cardId: string; name: string } | null; records: MarketCardRecords }>();

const Records: Readonly<Record<MarketCardRecords, { title: string; view: Component }>> = {
  reviews: { title: '评价', view: MarketReviewsTable },
  orders: { title: '订单', view: MarketOrdersView },
};

const title = computed(() => (props.card ? `${props.card.name} · ${Records[props.records].title}` : ''));
</script>

<template>
  <el-dialog
    v-model="visible"
    :title="title"
    width="min(1040px, 94vw)"
    align-center
    destroy-on-close
  >
    <div
      v-if="card"
      class="records"
    >
      <component
        :is="Records[records].view"
        :key="`${records}:${card.cardId}`"
        :card-id="card.cardId"
      />
    </div>
  </el-dialog>
</template>

<style scoped>
/* 里面的表是撑满父容器的满高列表，给它一个定高的盒子，分页贴底。 */
.records {
  height: 62vh;
  display: flex;
  flex-direction: column;
}
</style>
