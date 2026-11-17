import type { AppResult } from '@/shared/api/httpTypes';

import type {
  CatalogBoard,
  CatalogModel,
  CatalogModelEdit,
  JastalkUser,
  PageQuery,
  Paged,
  PointAccount,
  PointAdjust,
  PointBalance,
  PointRate,
  PointRateEdit,
  UsageLog,
  UsageLogQuery,
  UserQuery,
} from '../../model/jastalk.types';

/**
 * Jastalk 管理面：用户、积分、模型目录、定价、用量明细。
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

  // 模型目录
  catalog(): Promise<AppResult<CatalogBoard>>;
  saveModel(input: CatalogModelEdit): Promise<AppResult<CatalogModel>>;
  deleteModel(id: number): Promise<AppResult<true>>;

  // 定价
  rates(): Promise<AppResult<PointRate[]>>;
  /** 按 (渠道, 模型) 存：已有的是改价，没有的是新加。 */
  saveRate(input: PointRateEdit): Promise<AppResult<PointRate>>;
  deleteRate(id: number): Promise<AppResult<true>>;

  // 用量
  usageLogs(query: UsageLogQuery, page: PageQuery): Promise<AppResult<Paged<UsageLog>>>;
}
