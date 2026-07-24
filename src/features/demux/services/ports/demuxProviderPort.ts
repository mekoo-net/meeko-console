import type { AppResult } from '@/shared/api/httpTypes';
import type { Uid } from '@/shared/lib/id';

import type { ApiType, ProviderStatus } from '@demux/common';
import type {
  CreateProviderInput,
  FetchUpstreamModelsResult,
  ListProvidersFilter,
  Provider,
  ProviderTestResult,
  UpdateProviderInput,
} from '@demux/common';

export interface ListProvidersPage {
  items: Provider[];
  total: number;
}

/**
 * 控制面 —— `/admin/providers`。
 *
 * 保存（create/update/delete）时后端做原子重对账：
 *  - 出现新的 `modelMappings.displayName` → auto create 平台 Model（取首条
 *    承载它的 ProviderModel 的元数据）
 *  - 全局已无任何 mapping 引用的 displayName → auto delete 平台 Model
 *    （前端 Mock 硬删；真 BFF 软删用于日志 join，对前端透明）
 *
 * 因此前端不直接 create / delete Model。
 */
export interface DemuxProviderPort {
  list(input: {
    page: number;
    pageSize: number;
    filter: ListProvidersFilter;
  }): Promise<AppResult<ListProvidersPage>>;

  get(uid: Uid): Promise<AppResult<Provider>>;

  create(input: CreateProviderInput): Promise<AppResult<Provider>>;

  update(uid: Uid, input: UpdateProviderInput): Promise<AppResult<Provider>>;

  delete(uid: Uid): Promise<AppResult<void>>;

  setStatus(uid: Uid, status: ProviderStatus): Promise<AppResult<Provider>>;

  test(uid: Uid): Promise<AppResult<ProviderTestResult>>;

  /** 已保存的传 providerUid 走服务端凭据；草稿态传 apiKey + baseUrl。 */
  fetchUpstreamModels(input: {
    apiType: ApiType;
    baseUrl: string;
    apiKey?: string;
    providerUid?: Uid;
  }): Promise<AppResult<FetchUpstreamModelsResult>>;
}
