import type { AppResult } from '@/shared/api/httpTypes';

import type { ListPricingFilter, Pricing, UpsertPricingInput } from '../../model/pricing.types';

export interface ListPricingPage {
  items: Pricing[];
  total: number;
}

/**
 * 模型定价端口。控制面 —— 对应 demuxai 微服务 `/admin/pricing`。
 *
 * - 主键是 `modelId`（与 Model 1..1）
 * - upsert 语义：存在则更新，不存在则创建；写入时校验 modelId 对应的 Model 存在
 * - `effectiveFromUtc > now()` 时为预生效记录，BFF 调度按"最近一条已生效"取数
 * - 历史价格不可被修改，只能用新的 effectiveFrom 覆盖
 */
export interface DemuxaiPricingPort {
  list(input: {
    page: number;
    pageSize: number;
    filter: ListPricingFilter;
  }): Promise<AppResult<ListPricingPage>>;

  /** 按 modelId 取当前生效价；groupCode 默认 default */
  get(modelId: string, groupCode?: string): Promise<AppResult<Pricing>>;

  upsert(input: UpsertPricingInput): Promise<AppResult<Pricing>>;

  delete(modelId: string, groupCode?: string): Promise<AppResult<void>>;
}
