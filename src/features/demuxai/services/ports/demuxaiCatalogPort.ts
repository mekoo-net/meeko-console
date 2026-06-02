import type { AppResult } from '@/shared/api/httpTypes';

import type {
  DiscoverCatalogResult,
  ImportProviderGroupInput,
  ImportProviderGroupResult,
  ProviderGroup,
  ProviderUpstreamModel,
} from '../../model/catalog.types';

/**
 * 供应商组目录 Port。
 *
 * - **接入流程**（pull-on-demand）：admin 触发 `discoverFromGateway()` 拉取网关
 *   当前可服务的 QueueGroup + 上游模型清单 → 选择子集 → `importProviderGroup()`
 *   写入控制面表。
 * - 控制面**不维护**网关实例存活；调用时若上游不可达由 LLM 网关自己回错。
 * - 已入库的供应商组与上游模型分别用 `listProviderGroups()` / `listUpstreamModels()`
 *   暴露给「已接入」视图与定价页。
 */
export interface DemuxaiCatalogPort {
  /** 列出**已入库**的供应商组（左栏 / 定价页用）。 */
  listProviderGroups(): Promise<AppResult<ProviderGroup[]>>;

  /** 列出**已入库**的某供应商组下的上游模型。 */
  listUpstreamModels(queueGroup: string): Promise<AppResult<ProviderUpstreamModel[]>>;

  /**
   * 从 LLM 网关拉取一份当前可服务的 QueueGroup + 上游模型清单。
   * 返回里每条都带 `alreadyImported`，UI 可据此过滤或禁用勾选。
   */
  discoverFromGateway(): Promise<AppResult<DiscoverCatalogResult>>;

  /**
   * 把网关报告的某 QueueGroup 及其指定的上游模型入库。
   * - 若 QueueGroup 已存在则视为「补充模型」（幂等）。
   * - 已存在的 (queueGroup, vendorModel) 跳过，不计入 importedModelCount。
   */
  importProviderGroup(
    input: ImportProviderGroupInput,
  ): Promise<AppResult<ImportProviderGroupResult>>;

  /**
   * 删除已入库的供应商组，级联删除其下全部上游模型与对外别名（ModelRoute）。
   * 前端在调用前需向用户确认将要级联移除的模型 / 别名数量。
   */
  deleteProviderGroup(queueGroup: string): Promise<AppResult<void>>;

  /**
   * 删除单个已入库的上游模型，级联删除指向该模型的对外别名（ModelRoute）。
   * 前端在调用前需向用户确认将要级联移除的别名数量。
   */
  deleteUpstreamModel(queueGroup: string, vendorModel: string): Promise<AppResult<void>>;
}
