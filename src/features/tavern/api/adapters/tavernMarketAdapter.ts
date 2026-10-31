import { parseTavern, requestTavern, type ItemsEnvelope } from '@/features/tavern/api/http';
import type { TavernMarketPort } from '@/features/tavern/services/ports/tavernMarketPort';
import type { AppResult } from '@/shared/api/httpTypes';

import type { PageQuery } from '../../model/content.types';
import {
  marketItemDetailSchema,
  marketItemRowSchema,
  marketOrderRowSchema,
  marketReviewSchema,
  marketSettingsViewSchema,
  type MarketItemDetail,
  type MarketItemQuery,
  type MarketItemRow,
  type MarketOrderQuery,
  type MarketOrderRow,
  type MarketReview,
  type MarketSettings,
  type MarketSettingsView,
} from '../../model/market.types';
import { pageSchema } from '../../model/metering.types';

const BASE = '/tavern/api/admin/market';

const itemPageSchema = pageSchema(marketItemRowSchema);
const orderPageSchema = pageSchema(marketOrderRowSchema);
const reviewPageSchema = pageSchema(marketReviewSchema);

export class TavernMarketHttpAdapter implements TavernMarketPort {
  async items(query: MarketItemQuery, page: PageQuery): Promise<AppResult<ItemsEnvelope<MarketItemRow>>> {
    return parseTavern(itemPageSchema, await requestTavern<unknown>(`${BASE}/items`, { query: { ...page, ...query } }), '市场商品列表');
  }

  async item(itemId: string): Promise<AppResult<MarketItemDetail>> {
    return parseTavern(marketItemDetailSchema, await requestTavern<unknown>(`${BASE}/items/${itemId}`), '市场商品');
  }

  async reviews(itemId: string, page: PageQuery): Promise<AppResult<ItemsEnvelope<MarketReview>>> {
    return parseTavern(reviewPageSchema, await requestTavern<unknown>(`${BASE}/items/${itemId}/reviews`, { query: page }), '评价');
  }

  async takeDown(itemId: string, reason: string): Promise<AppResult<MarketItemRow>> {
    const res = await requestTavern<unknown>(`${BASE}/items/${itemId}/takedown`, { method: 'POST', body: { reason } });
    return parseTavern(marketItemRowSchema, res, '下架');
  }

  async restore(itemId: string): Promise<AppResult<MarketItemRow>> {
    const res = await requestTavern<unknown>(`${BASE}/items/${itemId}/restore`, { method: 'POST' });
    return parseTavern(marketItemRowSchema, res, '恢复上架');
  }

  async orders(query: MarketOrderQuery, page: PageQuery): Promise<AppResult<ItemsEnvelope<MarketOrderRow>>> {
    return parseTavern(orderPageSchema, await requestTavern<unknown>(`${BASE}/orders`, { query: { ...page, ...query } }), '市场订单');
  }

  async settings(): Promise<AppResult<MarketSettingsView>> {
    return parseTavern(marketSettingsViewSchema, await requestTavern<unknown>(`${BASE}/settings`), '市场分成');
  }

  async saveSettings(settings: MarketSettings): Promise<AppResult<MarketSettingsView>> {
    const res = await requestTavern<unknown>(`${BASE}/settings`, { method: 'PUT', body: settings });
    return parseTavern(marketSettingsViewSchema, res, '市场分成');
  }
}
