import type { AppResult } from '@/shared/api/httpTypes';

import type {
  CreateProviderGroupInput,
  CreateUpstreamModelInput,
  ProviderGroup,
  ProviderUpstreamModel,
  SyncProviderCatalogResult,
} from '../../model/catalog.types';

export interface DemuxaiCatalogPort {
  listProviderGroups(): Promise<AppResult<ProviderGroup[]>>;
  syncFromGateway(): Promise<AppResult<SyncProviderCatalogResult>>;
  listUpstreamModels(queueGroup: string): Promise<AppResult<ProviderUpstreamModel[]>>;
  createProviderGroup(input: CreateProviderGroupInput): Promise<AppResult<ProviderGroup>>;
  addUpstreamModel(input: CreateUpstreamModelInput): Promise<AppResult<ProviderUpstreamModel>>;
  removeUpstreamModel(
    queueGroup: string,
    upstreamModelId: string,
  ): Promise<AppResult<void>>;
}
