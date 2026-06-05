import type { AppResult } from '@/shared/api/httpTypes';

import type {
  ListPricingFilter,
  ListVendorModelGroupsFilter,
  Pricing,
  UpsertPricingInput,
  VendorModelGroup,
  VendorModelGroupedPage,
} from '../../model/pricing.types';

export interface ListPricingPage {
  items: Pricing[];
  total: number;
}

/**
 * 模型定价端口。控制面 —— 对应 demuxai 微服务 `/admin/pricing`。
 *
 * - 主键是 `modelId`（与 Model 1..1），可包含 `/`（如 `gemini/gemini-3.1-pro-preview`）
 * - upsert 语义：存在则更新，不存在则创建
 * - `effectiveFromUtc > now()` 时为预生效记录
 * - 历史价格不可被修改，只能用新的 effectiveFrom 覆盖
 */
export interface DemuxaiPricingPort {
  list(input: {
    page: number;
    pageSize: number;
    filter: ListPricingFilter;
  }): Promise<AppResult<ListPricingPage>>;

  listVendorModelGroups(input: {
    page: number;
    pageSize: number;
    filter: ListVendorModelGroupsFilter;
  }): Promise<AppResult<VendorModelGroupedPage>>;

  get(modelId: string): Promise<AppResult<Pricing>>;

  upsert(input: UpsertPricingInput): Promise<AppResult<Pricing>>;

  delete(modelId: string): Promise<AppResult<void>>;
}
