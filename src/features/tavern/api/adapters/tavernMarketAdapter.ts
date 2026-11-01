import { parseTavern, requestTavern, type ItemsEnvelope } from '@/features/tavern/api/http';
import type { TavernMarketPort } from '@/features/tavern/services/ports/tavernMarketPort';
import type { AppResult } from '@/shared/api/httpTypes';

import type { PageQuery } from '../../model/content.types';
import {
  inventoryRowSchema,
  marketItemDetailSchema,
  marketItemRowSchema,
  marketOrderDetailSchema,
  marketOrderRowSchema,
  marketReviewSchema,
  marketSettingsViewSchema,
  reviewSummarySchema,
  sellerEarningsSchema,
  sellerTxnSchema,
  withdrawalRowSchema,
  type InventoryQuery,
  type InventoryRow,
  type MarketItemDetail,
  type MarketItemQuery,
  type MarketItemRow,
  type MarketOrderDetail,
  type MarketOrderQuery,
  type MarketOrderRow,
  type MarketReview,
  type MarketSettings,
  type MarketSettingsView,
  type MarketReviewQuery,
  type ReviewSummary,
  type SellerEarnings,
  type SellerTxn,
  type WithdrawalQuery,
  type WithdrawalRow,
} from '../../model/market.types';
import { pageSchema } from '../../model/metering.types';

const BASE = '/tavern/api/admin/market';

const itemPageSchema = pageSchema(marketItemRowSchema);
const orderPageSchema = pageSchema(marketOrderRowSchema);
const reviewPageSchema = pageSchema(marketReviewSchema);
const inventoryPageSchema = pageSchema(inventoryRowSchema);
const withdrawalPageSchema = pageSchema(withdrawalRowSchema);
const sellerTxnPageSchema = pageSchema(sellerTxnSchema);

export class TavernMarketHttpAdapter implements TavernMarketPort {
  async items(query: MarketItemQuery, page: PageQuery): Promise<AppResult<ItemsEnvelope<MarketItemRow>>> {
    return parseTavern(itemPageSchema, await requestTavern<unknown>(`${BASE}/items`, { query: { ...page, ...query } }), '市场商品列表');
  }

  async item(itemId: string): Promise<AppResult<MarketItemDetail>> {
    return parseTavern(marketItemDetailSchema, await requestTavern<unknown>(`${BASE}/items/${itemId}`), '市场商品');
  }

  async reviews(itemId: string, query: MarketReviewQuery, page: PageQuery): Promise<AppResult<ItemsEnvelope<MarketReview>>> {
    const res = await requestTavern<unknown>(`${BASE}/items/${itemId}/reviews`, { query: { ...page, ...query } });
    return parseTavern(reviewPageSchema, res, '评价');
  }

  async reviewSummary(itemId: string): Promise<AppResult<ReviewSummary>> {
    return parseTavern(reviewSummarySchema, await requestTavern<unknown>(`${BASE}/items/${itemId}/reviews/summary`), '评价分类');
  }

  async takeDown(itemId: string, reason: string): Promise<AppResult<MarketItemRow>> {
    const res = await requestTavern<unknown>(`${BASE}/items/${itemId}/takedown`, { method: 'POST', body: { reason } });
    return parseTavern(marketItemRowSchema, res, '下架');
  }

  async relist(itemId: string): Promise<AppResult<MarketItemRow>> {
    return this.itemAction(itemId, 'relist', '上架');
  }

  async deleteItem(itemId: string): Promise<AppResult<MarketItemRow>> {
    return this.itemAction(itemId, 'delete', '删除');
  }

  async undelete(itemId: string): Promise<AppResult<MarketItemRow>> {
    return this.itemAction(itemId, 'undelete', '恢复');
  }

  private async itemAction(itemId: string, action: 'relist' | 'delete' | 'undelete', what: string): Promise<AppResult<MarketItemRow>> {
    const res = await requestTavern<unknown>(`${BASE}/items/${itemId}/${action}`, { method: 'POST' });
    return parseTavern(marketItemRowSchema, res, what);
  }

  async orders(query: MarketOrderQuery, page: PageQuery): Promise<AppResult<ItemsEnvelope<MarketOrderRow>>> {
    return parseTavern(orderPageSchema, await requestTavern<unknown>(`${BASE}/orders`, { query: { ...page, ...query } }), '市场订单');
  }

  async inventory(accountUid: number, query: InventoryQuery, page: PageQuery): Promise<AppResult<ItemsEnvelope<InventoryRow>>> {
    const res = await requestTavern<unknown>(`${BASE}/users/${accountUid}/inventory`, { query: { ...page, ...query } });
    return parseTavern(inventoryPageSchema, res, '用户的卡');
  }

  async order(orderId: string): Promise<AppResult<MarketOrderDetail>> {
    return parseTavern(marketOrderDetailSchema, await requestTavern<unknown>(`${BASE}/orders/${orderId}`), '订单');
  }

  async settings(): Promise<AppResult<MarketSettingsView>> {
    return parseTavern(marketSettingsViewSchema, await requestTavern<unknown>(`${BASE}/settings`), '市场分成');
  }

  async saveSettings(settings: MarketSettings): Promise<AppResult<MarketSettingsView>> {
    const res = await requestTavern<unknown>(`${BASE}/settings`, { method: 'PUT', body: settings });
    return parseTavern(marketSettingsViewSchema, res, '市场分成');
  }

  async withdrawals(query: WithdrawalQuery, page: PageQuery): Promise<AppResult<ItemsEnvelope<WithdrawalRow>>> {
    return parseTavern(withdrawalPageSchema, await requestTavern<unknown>(`${BASE}/withdrawals`, { query: { ...page, ...query } }), '提现申请');
  }

  async approveWithdrawal(id: string): Promise<AppResult<WithdrawalRow>> {
    return this.withdrawalAction(id, 'approve', undefined, '审核通过');
  }

  async rejectWithdrawal(id: string, reason: string): Promise<AppResult<WithdrawalRow>> {
    return this.withdrawalAction(id, 'reject', { reason }, '驳回');
  }

  async markWithdrawalPaid(id: string): Promise<AppResult<WithdrawalRow>> {
    return this.withdrawalAction(id, 'paid', undefined, '标记已打款');
  }

  async markWithdrawalFailed(id: string, reason: string): Promise<AppResult<WithdrawalRow>> {
    return this.withdrawalAction(id, 'failed', { reason }, '标记打款失败');
  }

  async seller(accountUid: number): Promise<AppResult<SellerEarnings>> {
    return parseTavern(sellerEarningsSchema, await requestTavern<unknown>(`${BASE}/sellers/${accountUid}`), '卖家收益');
  }

  async sellerTxns(accountUid: number, page: PageQuery): Promise<AppResult<ItemsEnvelope<SellerTxn>>> {
    return parseTavern(sellerTxnPageSchema, await requestTavern<unknown>(`${BASE}/sellers/${accountUid}/txns`, { query: page }), '收益明细');
  }

  private async withdrawalAction(
    id: string,
    action: 'approve' | 'reject' | 'paid' | 'failed',
    body: { reason: string } | undefined,
    what: string,
  ): Promise<AppResult<WithdrawalRow>> {
    const res = await requestTavern<unknown>(`${BASE}/withdrawals/${id}/${action}`, { method: 'POST', body });
    return parseTavern(withdrawalRowSchema, res, what);
  }
}
