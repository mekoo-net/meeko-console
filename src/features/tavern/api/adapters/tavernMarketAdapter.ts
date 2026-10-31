import { parseTavern, requestTavern, type ItemsEnvelope } from '@/features/tavern/api/http';
import type { TavernMarketPort } from '@/features/tavern/services/ports/tavernMarketPort';
import type { AppResult } from '@/shared/api/httpTypes';

import type { PageQuery } from '../../model/content.types';
import {
  marketCardDetailSchema,
  marketCardRowSchema,
  marketOrderRowSchema,
  marketSettingsViewSchema,
  type MarketCardDetail,
  type MarketCardQuery,
  type MarketCardRow,
  type MarketOrderQuery,
  type MarketOrderRow,
  type MarketSettings,
  type MarketSettingsView,
} from '../../model/market.types';
import { pageSchema } from '../../model/metering.types';

const BASE = '/tavern/api/admin/market';

const cardPageSchema = pageSchema(marketCardRowSchema);
const orderPageSchema = pageSchema(marketOrderRowSchema);

export class TavernMarketHttpAdapter implements TavernMarketPort {
  async cards(query: MarketCardQuery, page: PageQuery): Promise<AppResult<ItemsEnvelope<MarketCardRow>>> {
    return parseTavern(cardPageSchema, await requestTavern<unknown>(`${BASE}/cards`, { query: { ...page, ...query } }), '市场卡列表');
  }

  async card(cardId: string): Promise<AppResult<MarketCardDetail>> {
    return parseTavern(marketCardDetailSchema, await requestTavern<unknown>(`${BASE}/cards/${cardId}`), '市场卡');
  }

  async takeDown(cardId: string, reason: string): Promise<AppResult<MarketCardRow>> {
    const res = await requestTavern<unknown>(`${BASE}/cards/${cardId}/takedown`, { method: 'POST', body: { reason } });
    return parseTavern(marketCardRowSchema, res, '下架');
  }

  async restore(cardId: string): Promise<AppResult<MarketCardRow>> {
    const res = await requestTavern<unknown>(`${BASE}/cards/${cardId}/restore`, { method: 'POST' });
    return parseTavern(marketCardRowSchema, res, '恢复上架');
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
