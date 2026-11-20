import type { AppResult } from '@/shared/api/httpTypes';

import type {
  CatalogBoard,
  CatalogModel,
  CatalogModelEdit,
  ChannelBoard,
  ChannelDetail,
  ChannelEdit,
  ChannelSaved,
  JastalkUser,
  ModelCategory,
  ModelImport,
  ModelImportResult,
  PageQuery,
  Paged,
  PointAccount,
  PointAdjust,
  PointBalance,
  PointRate,
  PointRateEdit,
  RateCompileResult,
  UsageLog,
  UsageLogQuery,
  UserQuery,
} from '../../model/jastalk.types';

/**
 * Jastalk 管理面：用户、积分、渠道、模型目录、价格表、用量明细。
 * 一个产品的管理面不大，放在一个端口里；签发网关凭据是另一个（平台设置的「网关接入」页在用）。
 */
export interface JastalkAdminPort {
  // 用户
  listUsers(query: UserQuery, page: PageQuery): Promise<AppResult<Paged<JastalkUser>>>;
  /** 停用 / 恢复。停用后连不上、冻不了积分；已经在进行的调用照常结算。 */
  setBlocked(accountUid: number, blocked: boolean): Promise<AppResult<true>>;

  // 积分
  pointAccount(accountUid: number, page: PageQuery): Promise<AppResult<PointAccount>>;
  adjustPoints(accountUid: number, input: PointAdjust): Promise<AppResult<PointBalance>>;

  // 渠道
  /** 全部渠道：OneApi 在线的、这边定过倍率的、目录里有模型的，并在一起。 */
  channels(): Promise<AppResult<ChannelBoard>>;
  /**
   * 一个渠道：接进来的模型（各带价格的来源和牌价），和 OneApi 有、还没接的。
   * `previewCategory`：还没接的模型打算接成哪一类，它们的牌价就按这一类的计量单位折；不给按对话。
   * 已经接进来的不受它影响，各按自己那一类折。
   */
  channel(vendorKey: string, previewCategory?: ModelCategory): Promise<AppResult<ChannelDetail>>;
  /** 定名字和倍率；后端当场把这个渠道跟牌价走的价重算一遍，结果一起回来。 */
  saveChannel(vendorKey: string, input: ChannelEdit): Promise<AppResult<ChannelSaved>>;
  /** 从 OneApi 的清单里接一批模型（一次一类）；这一类里已有的跳过。 */
  importModels(vendorKey: string, input: ModelImport): Promise<AppResult<ModelImportResult>>;
  /** 手动重算；不给渠道就全算。平时不用：改倍率、接模型、删单独定的价时后端自己会算。 */
  compileRates(vendorKey?: string): Promise<AppResult<RateCompileResult>>;

  // 模型目录
  catalog(): Promise<AppResult<CatalogBoard>>;
  saveModel(input: CatalogModelEdit): Promise<AppResult<CatalogModel>>;
  deleteModel(id: number): Promise<AppResult<true>>;

  // 价格表
  rates(): Promise<AppResult<PointRate[]>>;
  /** 按 (渠道, 模型) 存：已有的是改价，没有的是新加。存了就是单独定价——改一行算出来的也一样。 */
  saveRate(input: PointRateEdit): Promise<AppResult<PointRate>>;
  /** 删的是单独定的价时，这个模型跟回渠道倍率，后端当场重算。 */
  deleteRate(id: number): Promise<AppResult<true>>;

  // 用量
  usageLogs(query: UsageLogQuery, page: PageQuery): Promise<AppResult<Paged<UsageLog>>>;
}
