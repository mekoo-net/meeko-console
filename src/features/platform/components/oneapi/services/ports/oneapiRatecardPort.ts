import type { AppResult } from '@/shared/api/httpTypes';

import type {
  ApplyPriceItem,
  ImportPricesInput,
  ModelPriceRow,
  PriceApplyResult,
  PriceDeleteResult,
  PriceFetchResult,
  PriceImportResult,
  PriceMakerGroup,
  PricePublishResult,
  PriceWriteResult,
  RatecardRelayStatus,
  UpsertPriceInput,
} from '../../model/ratecard.types';

/**
 * OneApi 的模型价格（美元牌价）—— 对应号池后台的 `/v1/ratecard/**`，对外是 `/oneapi/vault/v1/ratecard/**`。
 *
 * 表的主人是 OneApi 的号池后台；它自己登记路由，平台网关验完身份直接把请求转给它，不经 Bff。
 * 只有 `relayStatus`（这份表到没到平台）问的是平台的 Bff：订阅 OneApi 的 NATS、通知各产品的是它。
 *
 * 每个写操作号池后台都当场把受影响的厂家发布出去，回包里带发布结果（`publish`）：
 * 「库里写成了」和「发布出去了」是两件事，这里原样交回去，怎么告诉人由页面统一做。
 * 这边只有牌价，不算有效价——倍率和有效价是各产品自己的事。
 */
export interface OneApiRatecardPort {
  /**
   * 整张表，按厂家分好组（一个模型一行，表不大，不分页）。
   * `keyword` 对模型键和来源标识做包含匹配，空串是全部。
   */
  listByMaker(input: { keyword: string }): Promise<AppResult<PriceMakerGroup[]>>;

  /**
   * 按名字找一行；没有回 null。号池后台先把名字收成价格表的键再找（带渠道前缀、带日期钉、点横线写法不同的
   * 都对到同一行上），所以新建之前拿它查重，比前端自己比字符串准。
   */
  find(modelKey: string): Promise<AppResult<ModelPriceRow | null>>;

  /** 录入一行：带 `id` 是改那一行，不带是按键新建（见 {@link UpsertPriceInput}）。 */
  upsert(input: UpsertPriceInput): Promise<AppResult<PriceWriteResult>>;

  /** 按行号删一行。这个厂家一行都不剩时，它发布出去的那一份一并撤下。 */
  remove(id: string): Promise<AppResult<PriceDeleteResult>>;

  /** 从外部目录（models.dev）拉候选价，和表里的对比。只读，不写库也不发布。`maker` 给了只拉这一家。 */
  fetchCandidates(input: { maker: string | null }): Promise<AppResult<PriceFetchResult>>;

  /** 把勾选的候选写进表里。任何一行校验不过，整批都不写。 */
  applyCandidates(items: ApplyPriceItem[]): Promise<AppResult<PriceApplyResult>>;

  /** 批量导入一段现成的表。先整批验完再动库，任何一行不过整批都不写。 */
  importPrices(input: ImportPricesInput): Promise<AppResult<PriceImportResult>>;

  /**
   * 把整张表和发布出去的那一份对一遍：内容不同的厂家重写，多出来的撤下。表本身不变。
   * `takeover`：由号池后台现在连的这个库接管这份表——发布着的、别的库的牌价会被换掉，各产品收到就照着重算。
   * 登记的主人是别的库时，不带它的发布一律不写。
   */
  publish(input?: { takeover?: boolean }): Promise<AppResult<PricePublishResult>>;

  /** 这份表到了平台没有、平台最近一次通知各产品的结果。 */
  relayStatus(): Promise<AppResult<RatecardRelayStatus>>;
}
