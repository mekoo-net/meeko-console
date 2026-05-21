import type { AppResult } from '@/shared/api/httpTypes';
import { fail } from '@/shared/api/httpTypes';
import type { Uid } from '@/shared/lib/id';

import type {
  CreateModelRouteInput,
  ListModelRoutesFilter,
  ModelRoute,
  UpdateModelRouteInput,
} from '@/features/demuxai/model/modelRoute.types';
import type {
  DemuxaiModelRoutePort,
  ListModelRoutesPage,
} from '@/features/demuxai/services/ports/demuxaiModelRoutePort';

/** 模型路由 API 待接；HTTP 模式暂不可用。 */
export class DemuxaiModelRouteHttpAdapter implements DemuxaiModelRoutePort {
  private unavailable(): AppResult<never> {
    return fail({
      code: 'upstream',
      message: '模型路由 API 尚未接入，请使用 Mock 模式预览新界面。',
    });
  }

  async list(_input: {
    page: number;
    pageSize: number;
    filter: ListModelRoutesFilter;
  }): Promise<AppResult<ListModelRoutesPage>> {
    return this.unavailable();
  }

  async get(_uid: Uid): Promise<AppResult<ModelRoute>> {
    return this.unavailable();
  }

  async create(_input: CreateModelRouteInput): Promise<AppResult<ModelRoute>> {
    return this.unavailable();
  }

  async update(_uid: Uid, _input: UpdateModelRouteInput): Promise<AppResult<ModelRoute>> {
    return this.unavailable();
  }

  async delete(_uid: Uid): Promise<AppResult<void>> {
    return this.unavailable();
  }

  async setStatus(_uid: Uid, _status: ModelRoute['status']): Promise<AppResult<ModelRoute>> {
    return this.unavailable();
  }
}
