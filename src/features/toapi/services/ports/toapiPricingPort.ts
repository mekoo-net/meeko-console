import type { AppResult } from '@/shared/api/httpTypes';

import type {
  ModelRate,
  PublishModelRateInput,
  SupplyGroup,
  UpsertSupplyGroupInput,
} from '../../model/pricing.types';
import type {
  DiscoverVendorsResult,
  ImportVendorInput,
  ImportVendorResult,
  VendorModel,
} from '../../model/vendor.types';

export interface ToApiPricingPort {
  listGroups(): Promise<AppResult<SupplyGroup[]>>;
  upsertGroup(input: UpsertSupplyGroupInput): Promise<AppResult<SupplyGroup>>;
  disableGroup(key: string): Promise<AppResult<void>>;

  /** 从网关拉当前能服务的供应商及模型，并标出哪些已接入。 */
  discoverVendors(): Promise<AppResult<DiscoverVendorsResult>>;
  /** 已接入的模型；给 vendorKey 只取该分组，不给取全部（列表页算计数用，别逐组打）。 */
  listVendorModels(vendorKey?: string): Promise<AppResult<VendorModel[]>>;
  /** 接入供应商：不存在则建组（key = vendor_key），再把勾选的模型放进去；重复模型忽略。 */
  importVendor(input: ImportVendorInput): Promise<AppResult<ImportVendorResult>>;
  removeVendorModel(vendorKey: string, modelId: string): Promise<AppResult<void>>;

  listRates(input: { groupKey?: string; history: boolean }): Promise<AppResult<ModelRate[]>>;
  /** 发布新价：同组同模型旧行自动 superseded。 */
  publishRate(input: PublishModelRateInput): Promise<AppResult<ModelRate>>;
  /** 下架：active 行 superseded、不发新行。 */
  retireRate(groupKey: string, modelId: string): Promise<AppResult<void>>;
}
