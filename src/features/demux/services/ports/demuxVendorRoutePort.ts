import type { AppResult } from '@/shared/api/httpTypes';
import type { Uid } from '@/shared/lib/id';

import type {
  CreateVendorRouteInput,
  ListVendorRoutesFilter,
  VendorRoute,
  VendorRouteStats,
  UpdateVendorRouteInput,
} from '../../model/vendorRoute.types';

export interface ListVendorRoutesPage {
  items: VendorRoute[];
  total: number;
}

export interface DemuxVendorRoutePort {
  list(input: {
    page: number;
    pageSize: number;
    filter: ListVendorRoutesFilter;
  }): Promise<AppResult<ListVendorRoutesPage>>;
  get(uid: Uid): Promise<AppResult<VendorRoute>>;
  create(input: CreateVendorRouteInput): Promise<AppResult<VendorRoute>>;
  update(uid: Uid, input: UpdateVendorRouteInput): Promise<AppResult<VendorRoute>>;
  delete(uid: Uid): Promise<AppResult<void>>;
  setPublished(uid: Uid, isPublished: boolean): Promise<AppResult<VendorRoute>>;
  stats(vendorKey: string): Promise<AppResult<VendorRouteStats>>;
}
