import type { AppResult } from '@/shared/api/httpTypes';

import type {
  ListRateFilter,
  ListVendorModelGroupsFilter,
  Rate,
  UnconfiguredRoutePage,
  UpsertRateInput,
  VendorModelGroupedPage,
  VendorRateStatsMap,
} from '@demux/common';

export interface ListRatePage {
  items: Rate[];
  total: number;
}

/**
 * 模型定价端口。控制面 —— 对应 demuxai 微服务 `/admin/rate`。
 *
 * - 主键是 `modelId`（与 Model 1..1），可包含 `/`（如 `gemini/gemini-3.1-pro-preview`）
 * - upsert 语义：存在则更新，不存在则创建
 * - 币种恒为 `PRICE_CURRENCY`、生效时间由后端取落库时刻，都不由调用方传
 */
export interface DemuxRatePort {
  list(input: {
    page: number;
    pageSize: number;
    filter: ListRateFilter;
  }): Promise<AppResult<ListRatePage>>;

  listVendorModelGroups(input: {
    page: number;
    pageSize: number;
    filter: ListVendorModelGroupsFilter;
  }): Promise<AppResult<VendorModelGroupedPage>>;

  get(modelId: string): Promise<AppResult<Rate>>;

  upsert(input: UpsertRateInput): Promise<AppResult<Rate>>;

  delete(id: string): Promise<AppResult<void>>;

  vendorRateStats(): Promise<AppResult<VendorRateStatsMap>>;

  listUnconfiguredRoutes(input: {
    page: number;
    pageSize: number;
    vendorKey: string;
  }): Promise<AppResult<UnconfiguredRoutePage>>;
}
