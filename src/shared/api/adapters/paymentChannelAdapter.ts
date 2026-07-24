import type { AppResult } from '@/shared/api/httpTypes';
import { request } from '@/shared/api/httpClient';

import type {
  ChannelConfigSchema,
  ChannelConfigValues,
  ChannelType,
  PaymentChannel,
} from '@/features/platform/billing/model/paymentChannel.types';
import type { PaymentChannelPort } from '@/features/platform/billing/services/ports/paymentChannelPort';

const BASE = '/api/admin/billing/channels';

type ApiChannelDto = {
  id: number;
  driverCode: string;
  displayName: string;
  driverDisplayName?: string | null;
  isActive: boolean;
  isConfigured: boolean;
  supportedScenes: string[];
};

type ApiChannelTypeDto = {
  code: string;
  displayName: string;
  allowMultiple: boolean;
  instanceCount: number;
  supportedScenes: string[];
  fields: ChannelType['fields'];
};

function mapChannel(dto: ApiChannelDto): PaymentChannel {
  return {
    id: dto.id,
    driverCode: dto.driverCode,
    name: dto.displayName,
    driverName: dto.driverDisplayName ?? undefined,
    isActive: dto.isActive,
    isConfigured: dto.isConfigured,
    supportedScenes: dto.supportedScenes ?? [],
  };
}

function mapType(dto: ApiChannelTypeDto): ChannelType {
  return {
    code: dto.code,
    displayName: dto.displayName,
    allowMultiple: dto.allowMultiple,
    instanceCount: dto.instanceCount,
    supportedScenes: dto.supportedScenes ?? [],
    fields: dto.fields ?? [],
  };
}

export class PaymentChannelHttpAdapter implements PaymentChannelPort {
  async listChannels(): Promise<AppResult<PaymentChannel[]>> {
    const r = await request<ApiChannelDto[]>(BASE);
    if (!r.success) return r;
    return { success: true, data: (r.data ?? []).map(mapChannel) };
  }

  async listChannelTypes(): Promise<AppResult<ChannelType[]>> {
    const r = await request<ApiChannelTypeDto[]>(`${BASE}/types`);
    if (!r.success) return r;
    return { success: true, data: (r.data ?? []).map(mapType) };
  }

  async createChannel(driverCode: string, displayName: string): Promise<AppResult<PaymentChannel>> {
    const r = await request<ApiChannelDto>(BASE, {
      method: 'POST',
      body: { driverCode, displayName },
    });
    if (!r.success) return r;
    return { success: true, data: mapChannel(r.data) };
  }

  async deleteChannel(id: number): Promise<AppResult<void>> {
    return request<void>(`${BASE}/${id}`, { method: 'DELETE' });
  }

  async setActive(id: number, active: boolean): Promise<AppResult<PaymentChannel>> {
    const r = await request<ApiChannelDto>(`${BASE}/${id}/active`, {
      method: 'PATCH',
      body: { active },
    });
    if (!r.success) return r;
    return { success: true, data: mapChannel(r.data) };
  }

  async getChannelSchema(id: number): Promise<AppResult<ChannelConfigSchema | null>> {
    const r = await request<ChannelConfigSchema | null>(`${BASE}/${id}/schema`);
    if (!r.success) return r;
    return { success: true, data: r.data };
  }

  async getChannelConfig(id: number): Promise<AppResult<ChannelConfigValues | null>> {
    const r = await request<ChannelConfigValues | null>(`${BASE}/${id}/config`);
    if (!r.success) return r;
    return { success: true, data: r.data };
  }

  async saveChannelConfig(id: number, values: Record<string, string>): Promise<AppResult<void>> {
    return request<void>(`${BASE}/${id}/config`, {
      method: 'PUT',
      body: values,
    });
  }
}
