import type { AppResult } from '@/shared/api/httpTypes';
import { request } from '@/shared/api/httpClient';

import type {
  ChannelConfigSchema,
  ChannelConfigValues,
  PaymentChannel,
} from '@/features/billing/model/paymentChannel.types';
import type { PaymentChannelPort } from '@/features/billing/services/ports/paymentChannelPort';

const BASE = '/api/admin/billing/channels';

type ApiChannelDto = {
  code: string;
  displayName: string;
  isActive: boolean;
  isConfigured: boolean;
  supportedScenes: string[];
};

function mapChannel(dto: ApiChannelDto): PaymentChannel {
  return {
    code: dto.code,
    name: dto.displayName,
    isActive: dto.isActive,
    isConfigured: dto.isConfigured,
    supportedScenes: dto.supportedScenes ?? [],
  };
}

export class PaymentChannelHttpAdapter implements PaymentChannelPort {
  async listChannels(): Promise<AppResult<PaymentChannel[]>> {
    const r = await request<ApiChannelDto[]>(BASE);
    if (!r.success) return r;
    return { success: true, data: (r.data ?? []).map(mapChannel) };
  }

  async setActive(code: string, active: boolean): Promise<AppResult<PaymentChannel>> {
    const r = await request<ApiChannelDto>(`${BASE}/${encodeURIComponent(code)}/active`, {
      method: 'PATCH',
      body: { active },
    });
    if (!r.success) return r;
    return { success: true, data: mapChannel(r.data) };
  }

  async getChannelSchema(code: string): Promise<AppResult<ChannelConfigSchema | null>> {
    const r = await request<ChannelConfigSchema | null>(`${BASE}/${encodeURIComponent(code)}/schema`);
    if (!r.success) return r;
    return { success: true, data: r.data };
  }

  async getChannelConfig(code: string): Promise<AppResult<ChannelConfigValues | null>> {
    const r = await request<ChannelConfigValues | null>(`${BASE}/${encodeURIComponent(code)}/config`);
    if (!r.success) return r;
    return { success: true, data: r.data };
  }

  async saveChannelConfig(code: string, values: Record<string, string>): Promise<AppResult<void>> {
    return request<void>(`${BASE}/${encodeURIComponent(code)}/config`, {
      method: 'PUT',
      body: values,
    });
  }
}
