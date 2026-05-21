import type { AppResult } from '@/shared/api/httpTypes';
import type { Uid } from '@/shared/lib/id';

import type {
  CreateModelRouteInput,
  ListModelRoutesFilter,
  ModelRoute,
  UpdateModelRouteInput,
} from '../../model/modelRoute.types';

export interface ListModelRoutesPage {
  items: ModelRoute[];
  total: number;
}

export interface DemuxaiModelRoutePort {
  list(input: {
    page: number;
    pageSize: number;
    filter: ListModelRoutesFilter;
  }): Promise<AppResult<ListModelRoutesPage>>;
  get(uid: Uid): Promise<AppResult<ModelRoute>>;
  create(input: CreateModelRouteInput): Promise<AppResult<ModelRoute>>;
  update(uid: Uid, input: UpdateModelRouteInput): Promise<AppResult<ModelRoute>>;
  delete(uid: Uid): Promise<AppResult<void>>;
  setStatus(uid: Uid, status: ModelRoute['status']): Promise<AppResult<ModelRoute>>;
}
