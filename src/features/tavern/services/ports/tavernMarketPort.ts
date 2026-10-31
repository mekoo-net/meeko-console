import type { ItemsEnvelope } from '@/features/tavern/api/http';
import type { AppResult } from '@/shared/api/httpTypes';

import type { PageQuery } from '../../model/content.types';
import type {
  MarketItemDetail,
  MarketItemQuery,
  MarketItemRow,
  MarketOrderQuery,
  MarketReview,
  MarketOrderRow,
  MarketSettings,
  MarketSettingsView,
} from '../../model/market.types';

/** 市场管理：商品（角色卡 / 世界书）、下架 / 恢复、订单、分成设置。下架与恢复回改完的那一行。 */
export interface TavernMarketPort {
  items(query: MarketItemQuery, page: PageQuery): Promise<AppResult<ItemsEnvelope<MarketItemRow>>>;
  item(itemId: string): Promise<AppResult<MarketItemDetail>>;
  /** 新的在前。 */
  reviews(itemId: string, page: PageQuery): Promise<AppResult<ItemsEnvelope<MarketReview>>>;
  takeDown(itemId: string, reason: string): Promise<AppResult<MarketItemRow>>;
  restore(itemId: string): Promise<AppResult<MarketItemRow>>;

  orders(query: MarketOrderQuery, page: PageQuery): Promise<AppResult<ItemsEnvelope<MarketOrderRow>>>;

  settings(): Promise<AppResult<MarketSettingsView>>;
  saveSettings(settings: MarketSettings): Promise<AppResult<MarketSettingsView>>;
}
