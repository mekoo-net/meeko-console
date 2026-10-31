import type { ItemsEnvelope } from '@/features/tavern/api/http';
import type { AppResult } from '@/shared/api/httpTypes';

import type { PageQuery } from '../../model/content.types';
import type {
  MarketCardDetail,
  MarketCardQuery,
  MarketCardRow,
  MarketOrderQuery,
  MarketReview,
  MarketOrderRow,
  MarketSettings,
  MarketSettingsView,
} from '../../model/market.types';

/** 市场管理：卡、下架 / 恢复、订单、分成设置。下架与恢复回改完的那一行。 */
export interface TavernMarketPort {
  cards(query: MarketCardQuery, page: PageQuery): Promise<AppResult<ItemsEnvelope<MarketCardRow>>>;
  card(cardId: string): Promise<AppResult<MarketCardDetail>>;
  /** 新的在前。 */
  reviews(cardId: string, page: PageQuery): Promise<AppResult<ItemsEnvelope<MarketReview>>>;
  takeDown(cardId: string, reason: string): Promise<AppResult<MarketCardRow>>;
  restore(cardId: string): Promise<AppResult<MarketCardRow>>;

  orders(query: MarketOrderQuery, page: PageQuery): Promise<AppResult<ItemsEnvelope<MarketOrderRow>>>;

  settings(): Promise<AppResult<MarketSettingsView>>;
  saveSettings(settings: MarketSettings): Promise<AppResult<MarketSettingsView>>;
}
