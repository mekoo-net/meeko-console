import type { ItemsEnvelope } from '@/features/tavern/api/http';
import type { AppResult } from '@/shared/api/httpTypes';

import type { PageQuery } from '../../model/content.types';
import type {
  MarketItemDetail,
  MarketItemQuery,
  MarketItemRow,
  MarketOrderDetail,
  MarketOrderQuery,
  MarketReview,
  MarketReviewQuery,
  MarketOrderRow,
  MarketSettings,
  MarketSettingsView,
  ReviewSummary,
  SellerEarnings,
  SellerTxn,
  WithdrawalQuery,
  WithdrawalRow,
} from '../../model/market.types';

/** 市场管理：商品（角色卡 / 世界卡）、下架 / 恢复、订单、分成设置、卖家收益与提现审核。动作都回改完的那一行。 */
export interface TavernMarketPort {
  items(query: MarketItemQuery, page: PageQuery): Promise<AppResult<ItemsEnvelope<MarketItemRow>>>;
  item(itemId: string): Promise<AppResult<MarketItemDetail>>;
  /** 新的在前；可以只看某个买家的、只看好评 / 中评 / 差评。 */
  reviews(itemId: string, query: MarketReviewQuery, page: PageQuery): Promise<AppResult<ItemsEnvelope<MarketReview>>>;
  /** 好评、中评、差评各几条。 */
  reviewSummary(itemId: string): Promise<AppResult<ReviewSummary>>;
  takeDown(itemId: string, reason: string): Promise<AppResult<MarketItemRow>>;
  /** 重新上架已下架的。 */
  relist(itemId: string): Promise<AppResult<MarketItemRow>>;
  /** 删除已下架的，不用原因，能恢复；已买的照常用。 */
  deleteItem(itemId: string): Promise<AppResult<MarketItemRow>>;
  /** 恢复删除的，回到已下架。 */
  undelete(itemId: string): Promise<AppResult<MarketItemRow>>;

  orders(query: MarketOrderQuery, page: PageQuery): Promise<AppResult<ItemsEnvelope<MarketOrderRow>>>;
  /** 一单的详情：钱怎么分、结算、账单号、失败原因、卖家收益流水。 */
  order(orderId: string): Promise<AppResult<MarketOrderDetail>>;

  settings(): Promise<AppResult<MarketSettingsView>>;
  saveSettings(settings: MarketSettings): Promise<AppResult<MarketSettingsView>>;

  /** 提现单号新的在前。 */
  withdrawals(query: WithdrawalQuery, page: PageQuery): Promise<AppResult<ItemsEnvelope<WithdrawalRow>>>;
  approveWithdrawal(id: string): Promise<AppResult<WithdrawalRow>>;
  /** 驳回、打款失败都要写原因，卖家看得到；钱退回可提现。 */
  rejectWithdrawal(id: string, reason: string): Promise<AppResult<WithdrawalRow>>;
  markWithdrawalPaid(id: string): Promise<AppResult<WithdrawalRow>>;
  markWithdrawalFailed(id: string, reason: string): Promise<AppResult<WithdrawalRow>>;

  /** 用户视角：这个卖家的四格余额。 */
  seller(accountUid: number): Promise<AppResult<SellerEarnings>>;
  /** 用户视角：这个卖家的收益明细，新的在前。 */
  sellerTxns(accountUid: number, page: PageQuery): Promise<AppResult<ItemsEnvelope<SellerTxn>>>;
}
