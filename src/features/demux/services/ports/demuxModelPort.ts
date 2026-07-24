import type { AppResult } from '@/shared/api/httpTypes';
import type { Uid } from '@/shared/lib/id';

import type {
  ListModelsFilter,
  Model,
  ModelCarriersMap,
  UpdateModelInput,
} from '@demux/common';

export interface ListModelsPage {
  items: Model[];
  total: number;
}

/**
 * 对外模型管理端口 —— **元数据编辑器**，不负责生命周期。
 *
 * Model 的 create / delete **完全由 Provider 端的 modelMappings 增删驱动**：
 * 在 `DemuxProviderPort` upsert/delete 时，BFF 做原子重对账：
 *  - 新增引用 → auto create Model（默认元数据 + name 推断 family）
 *  - 引用计数归零 → auto delete Model（前端 Mock 硬删，BFF 软删）
 *
 * 因此本端口**只**提供：
 *  - `list / get`：浏览
 *  - `update`：编辑元数据（displayName / family / capabilities / 可见 LV / 上下文上限 / tags / 简介 ...）
 *
 * Note: `modelId` 不可改（它是计费 / 配额主键 + Provider mapping 的 FK）。
 */
export interface DemuxModelPort {
  list(input: {
    page: number;
    pageSize: number;
    filter: ListModelsFilter;
  }): Promise<AppResult<ListModelsPage>>;

  get(uid: Uid): Promise<AppResult<Model>>;

  update(uid: Uid, input: UpdateModelInput): Promise<AppResult<Model>>;

  carriers(modelIds: string[]): Promise<AppResult<ModelCarriersMap>>;
}
