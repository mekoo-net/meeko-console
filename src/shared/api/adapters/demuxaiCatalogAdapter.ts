import type { AppResult } from '@/shared/api/httpTypes';
import { fail } from '@/shared/api/httpTypes';

import type {
  CreateProviderGroupInput,
  CreateUpstreamModelInput,
  ProviderGroup,
  ProviderUpstreamModel,
  SyncProviderCatalogResult,
} from '@/features/demuxai/model/catalog.types';
import type { DemuxaiCatalogPort } from '@/features/demuxai/services/ports/demuxaiCatalogPort';

/** 供应商组目录 API 待接（网关 /cluster/status）；HTTP 模式暂不可用。 */
export class DemuxaiCatalogHttpAdapter implements DemuxaiCatalogPort {
  private unavailable(): AppResult<never> {
    return fail({
      code: 'upstream',
      message: '供应商组目录 API 尚未接入，请使用 Mock 模式预览。',
    });
  }

  async listProviderGroups(): Promise<AppResult<ProviderGroup[]>> {
    return this.unavailable();
  }

  async syncFromGateway(): Promise<AppResult<SyncProviderCatalogResult>> {
    return this.unavailable();
  }

  async listUpstreamModels(_queueGroup: string): Promise<AppResult<ProviderUpstreamModel[]>> {
    return this.unavailable();
  }

  async createProviderGroup(_input: CreateProviderGroupInput): Promise<AppResult<ProviderGroup>> {
    return this.unavailable();
  }

  async addUpstreamModel(_input: CreateUpstreamModelInput): Promise<AppResult<ProviderUpstreamModel>> {
    return this.unavailable();
  }

  async removeUpstreamModel(
    _queueGroup: string,
    _upstreamModelId: string,
  ): Promise<AppResult<void>> {
    return this.unavailable();
  }
}
